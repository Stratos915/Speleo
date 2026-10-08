// deno-lint-ignore-file no-explicit-any
// Job delle notifiche automatiche (eseguito da GitHub Actions o come Edge Function).
//
// Controlli:
//   1. OVERDUE          prestiti materiali ancora aperti oltre la data di riconsegna
//   2. USCITA_RIENTRO   uscite ancora aperte oltre il rientro previsto + tolleranza
//   3. DPI_ISPEZIONE    materiali con ispezione scaduta o entro 30 giorni
//   4. DPI_FINE_VITA    materiali con fine vita superata o entro 90 giorni
//   5. MOVIMENTO        consegne e rientri di materiale, riepilogo al magazziniere
//   6. NUOVA_USCITA     nuove uscite in calendario: email (copia nascosta) e notifica
//                       push a tutti i soci approvati, secondo le loro preferenze
//   7. USCITA_CAMBIATA  uscite in programma modificate (data, ora, luogo, titolo, tipo)
//                       o annullate: stesso avviso ai soci (richiede la migrazione 10)
//   8. PRESTITO_SOCIO   promemoria al socio che ha il materiale: il giorno prima della
//                       riconsegna (email e push) e, se scade, una notifica push
//
// Ogni avviso viene registrato in notification_log con (kind, ref_id) univoco:
// eseguire il job più volte non manda doppioni.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const INSPECTION_WARNING_DAYS = 30;
const END_OF_LIFE_WARNING_DAYS = 90;
// Uscite create entro queste ore e con data da oggi in avanti generano l'avviso.
const NUOVA_USCITA_FINESTRA_ORE = 6;
const APP_URL_DEFAULT = "https://speleoapp.netlify.app";
// Modifiche fatte da meno di questi minuti aspettano il giro dopo: più salvataggi
// di fila diventano un solo avviso.
const MODIFICHE_ATTESA_MINUTI = 10;
// I promemoria personali partono solo in questa fascia oraria (ora italiana).
const PROMEMORIA_DALLE = 8;
const PROMEMORIA_ALLE = 21;

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...data, ts: new Date().toISOString() }));
}

function errObj(e: unknown) {
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { error: String(e) };
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signWebhookPayload(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

type Config = {
  webhook: string;
  secret: string;
  testMode: boolean;
  recipients: { admin: string; magazziniere: string; presidente: string };
  toleranceMinutes: number;
};

type Claim = { kind: string; refId: string; meta?: Record<string, unknown> };

/** Registra l'avviso. Restituisce true se è nuovo, false se era già stato inviato. */
async function claim(supabase: SupabaseClient, runId: string, item: Claim, loanId: string | null = null) {
  const { error } = await supabase.from("notification_log").insert({
    kind: item.kind,
    ref_id: item.refId,
    loan_id: loanId,
    target_role: "staff",
    status: "PENDING",
    message: "Rilevato dal job (in attesa di invio)",
    meta: { runId, ...(item.meta ?? {}) },
  });
  if (!error) return true;
  if ((error as any).code === "23505") return false;
  if ((error as any).code === "42703" || (error as any).code === "42P01") {
    throw new Error(
      "notification_log non aggiornata: esegui la migrazione supabase/migrations/20260916090600_notifiche_idempotenti.sql",
    );
  }
  throw error;
}

async function markLog(supabase: SupabaseClient, kind: string, refIds: string[], status: string, message: string) {
  if (!refIds.length) return;
  await supabase
    .from("notification_log")
    .update({ status, message })
    .eq("kind", kind)
    .in("ref_id", refIds)
    .eq("status", "PENDING");
}

async function sendWebhook(config: Config, payload: Record<string, unknown>) {
  if (!config.webhook) return { configured: false, ok: true, status: null as number | null };
  const body = JSON.stringify({ ...payload, recipients: payload.recipients ?? config.recipients, test_run: config.testMode });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.testMode) headers["x-speleo-test-run"] = "true";
  if (config.secret) headers["x-speleo-signature"] = await signWebhookPayload(config.secret, body);
  const response = await fetch(config.webhook, { method: "POST", headers, body });
  if (!response.ok) {
    const preview = (await response.text().catch(() => "")).slice(0, 300);
    log("error", "Webhook failed", { status: response.status, preview, type: payload.type });
  }
  return { configured: true, ok: response.ok, status: response.status };
}

async function finalize(
  supabase: SupabaseClient,
  config: Config,
  kind: string,
  refIds: string[],
  result: { configured: boolean; ok: boolean; status: number | null },
) {
  if (!result.configured) return markLog(supabase, kind, refIds, "SKIPPED", "Webhook non configurato");
  if (config.testMode) return markLog(supabase, kind, refIds, "SKIPPED", "Modalità test");
  if (result.ok) return markLog(supabase, kind, refIds, "SENT", "Webhook consegnato");
  return markLog(supabase, kind, refIds, "ERROR", `Webhook fallito (status ${result.status})`);
}

async function notifyInApp(supabase: SupabaseClient, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) log("warn", "Notifiche in app non create", errObj(error));
}

// ---------------------------------------------------------------------------
// 1. Prestiti scaduti
// ---------------------------------------------------------------------------
async function checkOverdueLoans(supabase: SupabaseClient, config: Config, runId: string, today: string) {
  const kind = "OVERDUE";
  const { data, error } = await supabase
    .from("loans")
    .select("id, equipment_id, uscita_id, reserved_until, borrower_name, borrower_email, quantity, delivered_at")
    .in("status", ["in_corso", "active"])
    .not("reserved_until", "is", null)
    .lte("reserved_until", today);
  if (error) throw error;

  const fresh: any[] = [];
  for (const loan of data ?? []) {
    if (await claim(supabase, runId, { kind, refId: loan.id, meta: { reserved_until: loan.reserved_until } }, loan.id)) {
      fresh.push(loan);
    }
  }
  if (!fresh.length) return { total: data?.length ?? 0, new: 0 };

  const result = await sendWebhook(config, {
    type: "loans_due",
    date: today,
    count: fresh.length,
    total_due_count: data?.length ?? 0,
    loans: config.testMode ? fresh.slice(0, 1) : fresh,
    meta: { runId, kind },
  });
  await finalize(supabase, config, kind, fresh.map((loan) => loan.id), result);
  await notifyInApp(
    supabase,
    fresh.map((loan) => ({
      audience: "admin",
      target_role: "magazziniere",
      type: "warning",
      title: "Prestito non riconsegnato",
      message: `${loan.borrower_name ?? "Un socio"} doveva riconsegnare ${loan.quantity} pezzi entro il ${loan.reserved_until}.`,
      link: "/storico-prestiti",
      due_date: loan.reserved_until,
      meta: { loan_id: loan.id, runId },
    })),
  );
  return { total: data?.length ?? 0, new: fresh.length };
}

// ---------------------------------------------------------------------------
// 2. Uscite oltre il rientro previsto
// ---------------------------------------------------------------------------
async function checkUsciteRientro(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const kind = "USCITA_RIENTRO";
  const limit = new Date(now.getTime() - config.toleranceMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("uscite")
    .select("id, titolo, luogo, data, rientro_previsto, responsabile_id, responsabile_nome, status")
    .not("rientro_previsto", "is", null)
    .lte("rientro_previsto", limit)
    .or("status.is.null,status.neq.chiusa");
  if (error) {
    if ((error as any).code === "42703") {
      log("warn", "Colonna rientro_previsto assente: esegui la migrazione 06", {});
      return { total: 0, new: 0 };
    }
    throw error;
  }

  const fresh: any[] = [];
  for (const uscita of data ?? []) {
    const refId = `${uscita.id}:${uscita.rientro_previsto}`;
    if (await claim(supabase, runId, { kind, refId, meta: { rientro_previsto: uscita.rientro_previsto } })) {
      fresh.push({ ...uscita, refId });
    }
  }
  if (!fresh.length) return { total: data?.length ?? 0, new: 0 };

  // Email e utente del responsabile, se il socio ha un profilo collegato
  const memberIds = fresh.map((uscita) => uscita.responsabile_id).filter(Boolean);
  const responsabili = new Map<string, { id: string; email: string | null }>();
  if (memberIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, email, member_id").in("member_id", memberIds);
    (profiles ?? []).forEach((profile: any) => responsabili.set(String(profile.member_id), profile));
  }

  const enriched = fresh.map((uscita) => ({
    ...uscita,
    responsabile_email: responsabili.get(String(uscita.responsabile_id))?.email ?? null,
  }));

  const result = await sendWebhook(config, {
    type: "uscite_rientro_superato",
    count: enriched.length,
    tolerance_minutes: config.toleranceMinutes,
    uscite: config.testMode ? enriched.slice(0, 1) : enriched,
    recipients: {
      ...config.recipients,
      responsabili: [...new Set(enriched.map((uscita) => uscita.responsabile_email).filter(Boolean))],
    },
    note: "Promemoria automatico: non sostituisce le procedure di sicurezza né la chiamata al 112.",
    meta: { runId, kind },
  });
  await finalize(supabase, config, kind, enriched.map((uscita) => uscita.refId), result);

  const rows: Record<string, unknown>[] = [];
  for (const uscita of enriched) {
    const when = new Date(uscita.rientro_previsto).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const message = `L'uscita "${uscita.titolo}" risulta ancora aperta: il rientro era previsto per ${when}. Verificate che il gruppo sia rientrato e chiudete l'uscita.`;
    rows.push({
      audience: "admin",
      target_role: "presidente",
      type: "warning",
      title: "Rientro uscita superato",
      message,
      link: `/uscite/${uscita.id}`,
      due_date: uscita.rientro_previsto,
      meta: { uscita_id: uscita.id, runId },
    });
    const responsabile = responsabili.get(String(uscita.responsabile_id));
    if (responsabile?.id) {
      rows.push({
        audience: "user",
        user_id: responsabile.id,
        type: "warning",
        title: "Rientro uscita superato",
        message,
        link: `/uscite/${uscita.id}`,
        due_date: uscita.rientro_previsto,
        meta: { uscita_id: uscita.id, runId },
      });
    }
  }
  await notifyInApp(supabase, rows);
  return { total: data?.length ?? 0, new: enriched.length };
}

// ---------------------------------------------------------------------------
// 3-4. Scadenze DPI
// ---------------------------------------------------------------------------
async function checkDpi(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const inspectionLimit = isoDay(addDays(now, INSPECTION_WARNING_DAYS));
  const endOfLifeLimit = isoDay(addDays(now, END_OF_LIFE_WARNING_DAYS));
  const { data, error } = await supabase
    .from("equipment")
    .select("equipment_id, name, prossima_ispezione, fine_vita")
    .or(`prossima_ispezione.lte.${inspectionLimit},fine_vita.lte.${endOfLifeLimit}`);
  if (error) {
    if ((error as any).code === "42703") {
      log("warn", "Colonne DPI assenti: esegui la migrazione 05", {});
      return { total: 0, new: 0 };
    }
    throw error;
  }

  const items: any[] = [];
  for (const material of data ?? []) {
    if (material.prossima_ispezione && material.prossima_ispezione <= inspectionLimit) {
      const refId = `${material.equipment_id}:${material.prossima_ispezione}`;
      if (await claim(supabase, runId, { kind: "DPI_ISPEZIONE", refId })) {
        items.push({ kind: "DPI_ISPEZIONE", refId, material, date: material.prossima_ispezione });
      }
    }
    if (material.fine_vita && material.fine_vita <= endOfLifeLimit) {
      const refId = `${material.equipment_id}:${material.fine_vita}`;
      if (await claim(supabase, runId, { kind: "DPI_FINE_VITA", refId })) {
        items.push({ kind: "DPI_FINE_VITA", refId, material, date: material.fine_vita });
      }
    }
  }
  if (!items.length) return { total: data?.length ?? 0, new: 0 };

  const result = await sendWebhook(config, {
    type: "dpi_in_scadenza",
    count: items.length,
    items: items.map((item) => ({
      tipo: item.kind === "DPI_ISPEZIONE" ? "ispezione" : "fine_vita",
      data: item.date,
      equipment_id: item.material.equipment_id,
      nome: item.material.name,
    })),
    meta: { runId },
  });
  for (const kind of ["DPI_ISPEZIONE", "DPI_FINE_VITA"]) {
    await finalize(supabase, config, kind, items.filter((item) => item.kind === kind).map((item) => item.refId), result);
  }
  await notifyInApp(
    supabase,
    items.map((item) => ({
      audience: "admin",
      target_role: "magazziniere",
      type: "warning",
      title: item.kind === "DPI_ISPEZIONE" ? "Ispezione DPI in scadenza" : "Fine vita DPI",
      message:
        item.kind === "DPI_ISPEZIONE"
          ? `${item.material.name}: ispezione prevista entro il ${item.date}.`
          : `${item.material.name}: fine vita il ${item.date}. Programmare la sostituzione.`,
      link: "/magazzino",
      due_date: item.date,
      meta: { equipment_id: item.material.equipment_id, runId },
    })),
  );
  return { total: data?.length ?? 0, new: items.length };
}

// ---------------------------------------------------------------------------
// 5. Movimenti di magazzino: consegne e rientri registrati di recente
// ---------------------------------------------------------------------------
async function checkMovimenti(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const kind = "MOVIMENTO";
  // Finestra ampia: se un'esecuzione salta, i movimenti vengono comunque
  // segnalati. I doppioni sono impediti dall'indice su (kind, ref_id).
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("loans")
    .select("id, equipment_id, quantity, missing_quantity, status, borrower_name, delivered_at, returned_at, notes, equipment:equipment_id(name)")
    .or(`delivered_at.gte.${since},returned_at.gte.${since}`);
  if (error) throw error;

  const eventi: any[] = [];
  for (const loan of data ?? []) {
    const nome = (loan as any).equipment?.name ?? `materiale ${loan.equipment_id}`;
    if (loan.delivered_at && loan.delivered_at >= since) {
      eventi.push({
        refId: `${loan.id}:out:${loan.delivered_at}`,
        loanId: loan.id,
        tipo: "consegna",
        materiale: nome,
        quantita: loan.quantity,
        socio: loan.borrower_name,
        quando: loan.delivered_at,
        note: loan.notes ?? null,
      });
    }
    if (loan.returned_at && loan.returned_at >= since) {
      eventi.push({
        refId: `${loan.id}:in:${loan.returned_at}`,
        loanId: loan.id,
        tipo: "rientro",
        materiale: nome,
        quantita: loan.quantity,
        mancanti: loan.missing_quantity ?? 0,
        socio: loan.borrower_name,
        quando: loan.returned_at,
      });
    }
  }

  const fresh: any[] = [];
  for (const evento of eventi) {
    if (await claim(supabase, runId, { kind, refId: evento.refId, meta: { tipo: evento.tipo } }, evento.loanId)) {
      fresh.push(evento);
    }
  }
  if (!fresh.length) return { total: eventi.length, new: 0 };

  fresh.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));

  const result = await sendWebhook(config, {
    type: "movimenti_prestiti",
    count: fresh.length,
    items: config.testMode ? fresh.slice(0, 1) : fresh,
    recipients: { magazziniere: config.recipients.magazziniere, admin: config.recipients.admin },
    meta: { runId, kind },
  });
  await finalize(supabase, config, kind, fresh.map((evento) => evento.refId), result);
  return { total: eventi.length, new: fresh.length };
}

// ---------------------------------------------------------------------------
// 6. Nuove uscite: avviso a tutti i soci
// ---------------------------------------------------------------------------

/** Valori riservati (chiavi VAPID, modalità di prova). Null se la tabella non esiste ancora. */
async function loadPrivateConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("app_private_config").select("key, value");
  if (error) {
    // 42P01 dal database, PGRST205 dall'API: la tabella non esiste ancora.
    if (["42P01", "PGRST205"].includes((error as any).code)) return null;
    throw error;
  }
  return new Map<string, string>((data ?? []).map((row: any) => [row.key, row.value]));
}

function giornoIt(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short" });
}

function oraBreve(value: unknown) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value ?? ""));
  return match ? ` alle ${match[1]}:${match[2]}` : "";
}

type PushPayload = { title: string; body: string; url: string; tag: string };

async function sendPush(
  supabase: SupabaseClient,
  priv: Map<string, string>,
  userIds: string[],
  payloads: PushPayload[],
  testMode: boolean,
) {
  const publicKey = priv.get("vapid_public");
  const privateKey = priv.get("vapid_private");
  if (!publicKey || !privateKey) return { skipped: "chiavi VAPID assenti" };
  if (!userIds.length || !payloads.length) return { inviate: 0 };

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) throw error;
  if (!subs?.length) return { inviate: 0, dispositivi: 0 };
  if (testMode) return { skipped: "modalità test", dispositivi: subs.length };

  // Import dinamico: se la libreria non si carica, falliscono solo le push e non il resto del job.
  const webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(priv.get("vapid_subject") || "mailto:gsurbino@gmail.com", publicKey, privateKey);

  let inviate = 0;
  let rimosse = 0;
  let errori = 0;
  for (const sub of subs) {
    for (const payload of payloads) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 24 * 60 * 60 },
        );
        inviate += 1;
      } catch (e: any) {
        // 404/410: il browser ha revocato l'iscrizione, la togliamo.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          rimosse += 1;
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          break;
        }
        errori += 1;
        log("warn", "Push non consegnata", { status: e?.statusCode ?? null, message: String(e?.body ?? e?.message ?? e) });
      }
    }
    await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
  }
  return { dispositivi: subs.length, inviate, rimosse, errori };
}

/** Push in modo prudente: un errore qui non ferma il resto del controllo. */
async function sendPushSicuro(
  supabase: SupabaseClient,
  priv: Map<string, string>,
  userIds: string[],
  payloads: PushPayload[],
  testMode: boolean,
  runId: string,
) {
  try {
    return await sendPush(supabase, priv, userIds, payloads, testMode);
  } catch (e) {
    log("error", "Invio push fallito", { runId, ...errObj(e) });
    return { errore: errObj(e) };
  }
}

/**
 * Soci da avvisare: profili approvati, secondo le preferenze (senza riga = sì a tutto).
 * Con avvisi_uscite_solo_a (modalità di prova) resta solo quell'indirizzo.
 */
async function destinatariSoci(supabase: SupabaseClient, priv: Map<string, string>) {
  const [{ data: profili, error: profiliError }, { data: preferenze, error: prefError }] = await Promise.all([
    supabase.from("profiles").select("id, email").eq("approval_status", "approved"),
    supabase.from("notifica_preferenze").select("user_id, email, push"),
  ]);
  if (profiliError) throw profiliError;
  if (prefError) throw prefError;
  const pref = new Map<string, any>((preferenze ?? []).map((row: any) => [row.user_id, row]));
  const soloA = (priv.get("avvisi_uscite_solo_a") || "").trim().toLowerCase();
  const destinatari = (profili ?? []).filter(
    (profilo: any) => !soloA || String(profilo.email ?? "").toLowerCase() === soloA,
  );
  return {
    soloA,
    profili: profili ?? [],
    pref,
    emails: destinatari
      .filter((profilo: any) => pref.get(profilo.id)?.email !== false && profilo.email)
      .map((profilo: any) => profilo.email as string),
    pushUserIds: destinatari
      .filter((profilo: any) => pref.get(profilo.id)?.push !== false)
      .map((profilo: any) => profilo.id as string),
  };
}

async function checkNuoveUscite(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const kind = "NUOVA_USCITA";
  const since = new Date(now.getTime() - NUOVA_USCITA_FINESTRA_ORE * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("uscite")
    .select("id, titolo, luogo, data, ora, tipo, responsabile_nome, status, created_at")
    .gte("created_at", since)
    .order("data", { ascending: true });
  if (error) throw error;

  const oggi = isoDay(now);
  const candidate = (data ?? []).filter(
    (uscita: any) => uscita.data && String(uscita.data).slice(0, 10) >= oggi && uscita.status !== "chiusa",
  );
  if (!candidate.length) return { total: 0, new: 0 };

  const priv = await loadPrivateConfig(supabase);
  if (!priv) {
    log("warn", "app_private_config assente: esegui la migrazione 09 (avvisi_nuove_uscite)", {});
    return { total: candidate.length, new: 0, skipped: "migrazione 09 mancante" };
  }

  const fresh: any[] = [];
  for (const uscita of candidate) {
    if (await claim(supabase, runId, { kind, refId: uscita.id, meta: { data: uscita.data } })) fresh.push(uscita);
  }
  if (!fresh.length) return { total: candidate.length, new: 0 };

  const { soloA, emails, pushUserIds } = await destinatariSoci(supabase, priv);

  const result = await sendWebhook(config, {
    type: "nuova_uscita",
    count: fresh.length,
    uscite: fresh,
    app_url: priv.get("app_url") || APP_URL_DEFAULT,
    recipients: { soci: emails },
    meta: { runId, kind, solo_a: soloA || null },
  });
  await finalize(supabase, config, kind, fresh.map((uscita) => uscita.id), result);

  const primo = fresh[0];
  const payload: PushPayload = fresh.length === 1
    ? {
      title: `Nuova uscita: ${primo.titolo ?? "uscita"}`,
      body: `${giornoIt(primo.data)}${oraBreve(primo.ora)}${primo.luogo ? ` · ${primo.luogo}` : ""}`,
      url: `/uscite/${primo.id}`,
      tag: `uscita-${primo.id}`,
    }
    : {
      title: `${fresh.length} nuove uscite in calendario`,
      body: fresh.map((u) => `${giornoIt(u.data)} · ${u.titolo ?? "uscita"}`).join("\n"),
      url: "/calendario",
      tag: "nuove-uscite",
    };
  const push = await sendPushSicuro(supabase, priv, pushUserIds, [payload], config.testMode, runId);

  return { total: candidate.length, new: fresh.length, email: emails.length, push, prova: Boolean(soloA) };
}

// ---------------------------------------------------------------------------
// 7. Uscite modificate o annullate (eventi scritti dal trigger della migrazione 10)
// ---------------------------------------------------------------------------
const CAMPI_USCITA: { campo: string; etichetta: string }[] = [
  { campo: "data", etichetta: "Data" },
  { campo: "ora", etichetta: "Ora" },
  { campo: "luogo", etichetta: "Luogo" },
  { campo: "titolo", etichetta: "Titolo" },
  { campo: "tipo", etichetta: "Tipo" },
];

function valoreCampo(campo: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (campo === "data") return giornoIt(value);
  if (campo === "ora") return oraBreve(value).replace(" alle ", "") || String(value);
  return String(value);
}

function stessoValore(campo: string, a: unknown, b: unknown) {
  const norm = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const text = String(v);
    if (campo === "data") return text.slice(0, 10);
    if (campo === "ora") return text.slice(0, 5);
    return text.trim();
  };
  return norm(a) === norm(b);
}

async function checkUsciteCambiate(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const kind = "USCITA_CAMBIATA";
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: eventi, error } = await supabase
    .from("uscite_modifiche")
    .select("id, uscita_id, tipo, prima, dopo, created_at")
    .gte("created_at", since)
    .order("id", { ascending: true });
  if (error) {
    if (["42P01", "PGRST205"].includes((error as any).code)) {
      return { total: 0, new: 0, skipped: "migrazione 10 mancante" };
    }
    throw error;
  }
  if (!eventi?.length) return { total: 0, new: 0 };

  // Eventi già trattati in un giro precedente
  const { data: fatti, error: fattiError } = await supabase
    .from("notification_log")
    .select("ref_id")
    .eq("kind", kind)
    .in("ref_id", eventi.map((evento: any) => String(evento.id)));
  if (fattiError) throw fattiError;
  const giaFatti = new Set((fatti ?? []).map((row: any) => row.ref_id));
  const nuovi = eventi.filter((evento: any) => !giaFatti.has(String(evento.id)));
  if (!nuovi.length) return { total: eventi.length, new: 0 };

  const priv = await loadPrivateConfig(supabase);
  if (!priv) return { total: nuovi.length, new: 0, skipped: "migrazione 09 mancante" };

  const gruppi = new Map<string, any[]>();
  for (const evento of nuovi) {
    const lista = gruppi.get(evento.uscita_id) ?? [];
    lista.push(evento);
    gruppi.set(evento.uscita_id, lista);
  }
  const usciteIds = [...gruppi.keys()];
  const [{ data: attuali, error: attualiError }, { data: annunci, error: annunciError }] = await Promise.all([
    supabase.from("uscite").select("id, titolo, luogo, data, ora, tipo, status, created_at").in("id", usciteIds),
    supabase.from("notification_log").select("ref_id, created_at").eq("kind", "NUOVA_USCITA").in("ref_id", usciteIds),
  ]);
  if (attualiError) throw attualiError;
  if (annunciError) throw annunciError;
  const usciteOra = new Map<string, any>((attuali ?? []).map((u: any) => [u.id, u]));
  const annunciate = new Map<string, string>((annunci ?? []).map((row: any) => [row.ref_id, row.created_at]));

  const oggi = giornoRoma(now);
  const attesa = now.getTime() - MODIFICHE_ATTESA_MINUTI * 60 * 1000;
  const finestraNuova = now.getTime() - (NUOVA_USCITA_FINESTRA_ORE + 1) * 60 * 60 * 1000;
  const avvisi: any[] = [];
  const silenziati: string[] = [];
  let inAttesa = 0;

  for (const [uscitaId, lista] of gruppi) {
    const ultimo = lista[lista.length - 1];
    if (new Date(ultimo.created_at).getTime() > attesa) {
      inAttesa += 1;
      continue;
    }
    const ids = lista.map((evento) => String(evento.id));
    const annullata = lista.find((evento) => evento.tipo === "annullata");
    const uscita = usciteOra.get(uscitaId);
    const annunciataIl = annunciate.get(uscitaId);

    if (annullata && !uscita) {
      const prima = annullata.prima ?? {};
      const creata = new Date(prima.created_at ?? 0).getTime();
      const maiAnnunciata = !annunciataIl && creata > finestraNuova;
      const passata = !prima.data || String(prima.data).slice(0, 10) < oggi;
      if (maiAnnunciata || passata || prima.status === "chiusa") {
        silenziati.push(...ids);
        continue;
      }
      avvisi.push({ ids, esito: "annullata", uscita: { id: uscitaId, ...prima }, cambi: [] });
      continue;
    }
    if (!uscita) {
      silenziati.push(...ids);
      continue;
    }

    const dataPrima = String(lista[0].prima?.data ?? "").slice(0, 10);
    const dataOra = String(uscita.data ?? "").slice(0, 10);
    const futura = dataOra >= oggi || dataPrima >= oggi;
    const creataDaPoco = new Date(uscita.created_at).getTime() > finestraNuova;
    if (!futura || uscita.status === "chiusa") {
      silenziati.push(...ids);
      continue;
    }
    // Annuncio non ancora partito: arriverà già con i dati aggiornati.
    if (!annunciataIl && creataDaPoco) {
      if (dataOra >= oggi) {
        inAttesa += 1;
      } else {
        silenziati.push(...ids);
      }
      continue;
    }
    // L'annuncio è partito dopo l'ultima modifica: conteneva già i dati giusti.
    if (annunciataIl && new Date(annunciataIl).getTime() >= new Date(ultimo.created_at).getTime()) {
      silenziati.push(...ids);
      continue;
    }

    const prima = lista[0].prima ?? {};
    const cambi = CAMPI_USCITA
      .filter(({ campo }) => !stessoValore(campo, prima[campo], uscita[campo]))
      .map(({ campo, etichetta }) => ({
        campo,
        etichetta,
        prima: valoreCampo(campo, prima[campo]),
        dopo: valoreCampo(campo, uscita[campo]),
      }));
    if (!cambi.length) {
      silenziati.push(...ids);
      continue;
    }
    avvisi.push({ ids, esito: "modificata", uscita, cambi });
  }

  // Eventi che non meritano un avviso: registrati come saltati, così non tornano.
  for (const refId of silenziati) await claim(supabase, runId, { kind, refId, meta: { saltato: true } });
  await markLog(supabase, kind, silenziati, "SKIPPED", "Nessun avviso necessario");

  const fresh: any[] = [];
  for (const avviso of avvisi) {
    let nuovo = true;
    for (const refId of avviso.ids) {
      if (!(await claim(supabase, runId, { kind, refId, meta: { uscita_id: avviso.uscita.id, esito: avviso.esito } }))) {
        nuovo = false;
      }
    }
    if (nuovo) fresh.push(avviso);
  }
  if (!fresh.length) return { total: nuovi.length, new: 0, in_attesa: inAttesa, saltati: silenziati.length };

  const { soloA, emails, pushUserIds } = await destinatariSoci(supabase, priv);
  const items = fresh.map((avviso) => ({
    esito: avviso.esito,
    id: avviso.uscita.id,
    titolo: avviso.uscita.titolo,
    data: avviso.uscita.data,
    ora: avviso.uscita.ora,
    luogo: avviso.uscita.luogo,
    tipo: avviso.uscita.tipo,
    cambi: avviso.cambi,
  }));
  const result = await sendWebhook(config, {
    type: "uscite_cambiate",
    count: items.length,
    items,
    app_url: priv.get("app_url") || APP_URL_DEFAULT,
    recipients: { soci: emails },
    meta: { runId, kind, solo_a: soloA || null },
  });
  await finalize(supabase, config, kind, fresh.flatMap((avviso) => avviso.ids), result);

  const payloads: PushPayload[] = items.map((item) =>
    item.esito === "annullata"
      ? {
        title: `Uscita annullata: ${item.titolo ?? "uscita"}`,
        body: `${giornoIt(item.data)}${oraBreve(item.ora)}${item.luogo ? ` · ${item.luogo}` : ""} non si farà più.`,
        url: "/calendario",
        tag: `uscita-${item.id}`,
      }
      : {
        title: `Uscita modificata: ${item.titolo ?? "uscita"}`,
        body: item.cambi.map((cambio: any) => `${cambio.etichetta}: ${cambio.dopo}`).join(" · "),
        url: `/uscite/${item.id}`,
        tag: `uscita-${item.id}`,
      }
  );
  const push = await sendPushSicuro(supabase, priv, pushUserIds, payloads, config.testMode, runId);

  return {
    total: nuovi.length,
    new: fresh.length,
    in_attesa: inAttesa,
    saltati: silenziati.length,
    email: emails.length,
    push,
    prova: Boolean(soloA),
  };
}

// ---------------------------------------------------------------------------
// 8. Promemoria prestiti al socio che ha il materiale
// ---------------------------------------------------------------------------
function giornoRoma(date: Date) {
  // sv-SE produce AAAA-MM-GG
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function oraRoma(date: Date) {
  return Number(date.toLocaleString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }));
}

async function checkPromemoriaPrestiti(supabase: SupabaseClient, config: Config, runId: string, now: Date) {
  const kind = "PRESTITO_SOCIO";
  const ora = oraRoma(now);
  if (ora < PROMEMORIA_DALLE || ora >= PROMEMORIA_ALLE) return { total: 0, new: 0, skipped: "fuori orario" };

  const oggi = giornoRoma(now);
  const domani = giornoRoma(addDays(now, 1));
  const { data, error } = await supabase
    .from("loans")
    .select("id, equipment_id, quantity, reserved_until, borrower_name, borrower_email, borrower_member_number, equipment:equipment_id(name)")
    .in("status", ["in_corso", "active"])
    .not("reserved_until", "is", null)
    .lte("reserved_until", domani);
  if (error) throw error;
  if (!data?.length) return { total: 0, new: 0 };

  const priv = await loadPrivateConfig(supabase);
  if (!priv) return { total: data.length, new: 0, skipped: "migrazione 09 mancante" };
  const soloA = (priv.get("avvisi_uscite_solo_a") || "").trim().toLowerCase();

  // Profilo del socio: per email oppure per numero di tessera
  const numeri = [...new Set(data.map((loan: any) => loan.borrower_member_number).filter(Boolean))];
  const [{ data: profili, error: profiliError }, { data: soci, error: sociError }, { data: preferenze, error: prefError }] =
    await Promise.all([
      supabase.from("profiles").select("id, email, member_id").eq("approval_status", "approved"),
      numeri.length
        ? supabase.from("members").select("id, membership_number, email").in("membership_number", numeri)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("notifica_preferenze").select("user_id, email, push"),
    ]);
  if (profiliError) throw profiliError;
  if (sociError) throw sociError;
  if (prefError) throw prefError;
  const pref = new Map<string, any>((preferenze ?? []).map((row: any) => [row.user_id, row]));
  const profiloPerEmail = new Map<string, any>(
    (profili ?? []).filter((p: any) => p.email).map((p: any) => [String(p.email).toLowerCase(), p]),
  );
  const profiloPerSocio = new Map<string, any>(
    (profili ?? []).filter((p: any) => p.member_id).map((p: any) => [String(p.member_id), p]),
  );
  const socioPerNumero = new Map<number, any>((soci ?? []).map((s: any) => [s.membership_number, s]));

  let inviati = 0;
  const risultati: Record<string, unknown>[] = [];
  for (const loan of data as any[]) {
    const scadenza = String(loan.reserved_until).slice(0, 10);
    const fase = scadenza === domani ? "domani" : scadenza < oggi ? "scaduto" : null;
    if (!fase) continue; // scade oggi: il promemoria è già partito ieri

    const socio = socioPerNumero.get(loan.borrower_member_number);
    const email = String(loan.borrower_email || socio?.email || "").trim();
    const profilo = (email && profiloPerEmail.get(email.toLowerCase())) ||
      (socio && profiloPerSocio.get(String(socio.id))) || null;
    const indirizzo = email || profilo?.email || "";
    // Modalità di prova: solo il socio indicato, gli altri restano in attesa.
    if (soloA && String(indirizzo).toLowerCase() !== soloA) continue;

    const refId = `${loan.id}:${scadenza}:${fase}`;
    if (!(await claim(supabase, runId, { kind, refId, meta: { fase, scadenza } }, loan.id))) continue;

    const materiale = loan.equipment?.name ?? `materiale ${loan.equipment_id}`;
    const vuoleEmail = !profilo || pref.get(profilo.id)?.email !== false;
    const vuolePush = profilo && pref.get(profilo.id)?.push !== false;

    // Email solo per il giorno prima: per i prestiti scaduti c'è già l'avviso OVERDUE.
    const conEmail = fase === "domani" && vuoleEmail && Boolean(indirizzo);
    if (conEmail) {
      const result = await sendWebhook(config, {
        type: "prestito_promemoria",
        app_url: priv.get("app_url") || APP_URL_DEFAULT,
        prestito: {
          socio: loan.borrower_name,
          materiale,
          quantita: loan.quantity,
          scadenza,
        },
        recipients: { socio: indirizzo },
        meta: { runId, kind },
      });
      await finalize(supabase, config, kind, [refId], result);
    } else {
      await markLog(supabase, kind, [refId], config.testMode ? "SKIPPED" : "SENT", "Solo notifica push");
    }

    const push = vuolePush
      ? await sendPushSicuro(supabase, priv, [profilo.id], [
        fase === "domani"
          ? {
            title: "Promemoria riconsegna materiale",
            body: `Domani va riconsegnato: ${materiale} ×${loan.quantity ?? 1}.`,
            url: "/dashboard",
            tag: `prestito-${loan.id}`,
          }
          : {
            title: "Materiale da riconsegnare",
            body: `${materiale} ×${loan.quantity ?? 1}: la riconsegna era prevista per ${giornoIt(scadenza)}.`,
            url: "/dashboard",
            tag: `prestito-${loan.id}`,
          },
      ], config.testMode, runId)
      : { skipped: profilo ? "push disattivate" : "socio senza profilo" };

    inviati += 1;
    risultati.push({ fase, email: conEmail, push });
  }
  return { total: data.length, new: inviati, dettagli: risultati, prova: Boolean(soloA) };
}

// ---------------------------------------------------------------------------
/** Confronto a tempo costante, per non rivelare il token un carattere alla volta. */
function stessoToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Controlli per gruppo:
//   tutti  esecuzione completa (GitHub Actions, ogni 30 minuti quando GitHub ci riesce)
//   soci   solo gli avvisi ai soci, chiamati da pg_cron su Supabase ogni 10 minuti
//          (migrazione 11) con il token cron_soci_token di app_private_config.
// I due percorsi possono girare insieme: l'indice su (kind, ref_id) evita doppioni.
async function runCron(req: Request, interno = false) {
  const runId = crypto.randomUUID();
  const started = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const CRON_SECRET = Deno.env.get("NOTIFICATION_CRON_SECRET")?.trim() || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log("error", "Missing required env", { runId });
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let gruppo: "tutti" | "soci" = "tutti";
    if (!interno) {
      // Chiamata dall'esterno: serve il segreto del job (tutti i controlli)
      // oppure il token di pg_cron (solo gli avvisi ai soci).
      const provided = getBearer(req) || (req.headers.get("x-cron-secret") || "").trim();
      if (!(CRON_SECRET && stessoToken(provided, CRON_SECRET))) {
        const priv = await loadPrivateConfig(supabase).catch(() => null);
        const token = (priv?.get("cron_soci_token") || "").trim();
        if (!stessoToken((req.headers.get("x-avvisi-token") || "").trim(), token)) {
          log("warn", "Unauthorized", { runId });
          return json({ error: "Unauthorized" }, 401);
        }
        gruppo = "soci";
      } else if (new URL(req.url).searchParams.get("gruppo") === "soci") {
        gruppo = "soci";
      }
    }

    const config: Config = {
      // Senza variabile si usa la funzione email dello stesso progetto.
      webhook: Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK")?.trim() || `${SUPABASE_URL}/functions/v1/notification-email`,
      secret: Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET")?.trim() || "",
      testMode: (Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK_TEST_MODE") || "").toLowerCase() === "true",
      recipients: {
        admin: Deno.env.get("NOTIFICATION_ADMIN_EMAIL")?.trim() || "",
        magazziniere: Deno.env.get("NOTIFICATION_MAGAZZINIERE_EMAIL")?.trim() || "",
        presidente: Deno.env.get("NOTIFICATION_PRESIDENTE_EMAIL")?.trim() || "",
      },
      toleranceMinutes: Number(Deno.env.get("USCITA_RIENTRO_TOLLERANZA_MINUTI") || "60") || 60,
    };

    const now = new Date();
    const checks: Record<string, unknown> = {};
    const failures: Record<string, unknown> = {};

    // Ogni controllo è indipendente: un errore non blocca gli altri.
    const controlli: [string, () => Promise<unknown>][] = [
      ["prestiti", () => checkOverdueLoans(supabase, config, runId, isoDay(now))],
      ["uscite_rientro", () => checkUsciteRientro(supabase, config, runId, now)],
      ["dpi", () => checkDpi(supabase, config, runId, now)],
      ["movimenti", () => checkMovimenti(supabase, config, runId, now)],
      ["nuove_uscite", () => checkNuoveUscite(supabase, config, runId, now)],
      // Dopo le nuove uscite: così sa quali annunci sono già partiti.
      ["uscite_cambiate", () => checkUsciteCambiate(supabase, config, runId, now)],
      ["promemoria_prestiti", () => checkPromemoriaPrestiti(supabase, config, runId, now)],
    ];
    const CONTROLLI_SOCI = ["nuove_uscite", "uscite_cambiate", "promemoria_prestiti"];
    for (const [name, fn] of controlli.filter(([name]) => gruppo === "tutti" || CONTROLLI_SOCI.includes(name))) {
      try {
        checks[name] = await fn();
      } catch (e) {
        failures[name] = errObj(e);
        log("error", `Check ${name} failed`, { runId, ...errObj(e) });
      }
    }

    const ok = Object.keys(failures).length === 0;
    log(ok ? "info" : "error", "notification-cron done", { runId, gruppo, checks, failures, ms: Date.now() - started });
    return json({ ok, runId, gruppo, checks, failures, ms: Date.now() - started }, ok ? 200 : 500);
  } catch (e) {
    log("error", "Unhandled error", { runId, ...errObj(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
}

// --run-once oppure RUN_ONCE=true: esecuzione singola (GitHub Actions)
const RUN_ONCE = Deno.args.includes("--run-once") || (Deno.env.get("RUN_ONCE") || "").toLowerCase() === "true";

if (RUN_ONCE) {
  const req = new Request("http://localhost/notification-cron", { method: "POST" });
  const res = await runCron(req, true);
  console.log("[RUN_ONCE] status:", res.status);
  console.log("[RUN_ONCE] body:", await res.text().catch(() => ""));
  Deno.exit(res.ok ? 0 : 1);
}

serve((req) => runCron(req));
