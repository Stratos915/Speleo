// deno-lint-ignore-file no-explicit-any
// Job delle notifiche automatiche (eseguito da GitHub Actions o come Edge Function).
//
// Controlli:
//   1. OVERDUE          prestiti materiali ancora aperti oltre la data di riconsegna
//   2. USCITA_RIENTRO   uscite ancora aperte oltre il rientro previsto + tolleranza
//   3. DPI_ISPEZIONE    materiali con ispezione scaduta o entro 30 giorni
//   4. DPI_FINE_VITA    materiali con fine vita superata o entro 90 giorni
//
// Ogni avviso viene registrato in notification_log con (kind, ref_id) univoco:
// eseguire il job più volte non manda doppioni.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const INSPECTION_WARNING_DAYS = 30;
const END_OF_LIFE_WARNING_DAYS = 90;

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
async function runCron(req: Request) {
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
    if (CRON_SECRET) {
      const provided = getBearer(req) || (req.headers.get("x-cron-secret") || "").trim();
      if (provided !== CRON_SECRET) {
        log("warn", "Unauthorized (bad cron secret)", { runId });
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const config: Config = {
      webhook: Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK")?.trim() || "",
      secret: Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET")?.trim() || "",
      testMode: (Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK_TEST_MODE") || "").toLowerCase() === "true",
      recipients: {
        admin: Deno.env.get("NOTIFICATION_ADMIN_EMAIL")?.trim() || "",
        magazziniere: Deno.env.get("NOTIFICATION_MAGAZZINIERE_EMAIL")?.trim() || "",
        presidente: Deno.env.get("NOTIFICATION_PRESIDENTE_EMAIL")?.trim() || "",
      },
      toleranceMinutes: Number(Deno.env.get("USCITA_RIENTRO_TOLLERANZA_MINUTI") || "60") || 60,
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const now = new Date();
    const checks: Record<string, unknown> = {};
    const failures: Record<string, unknown> = {};

    // Ogni controllo è indipendente: un errore non blocca gli altri.
    for (const [name, fn] of [
      ["prestiti", () => checkOverdueLoans(supabase, config, runId, isoDay(now))],
      ["uscite_rientro", () => checkUsciteRientro(supabase, config, runId, now)],
      ["dpi", () => checkDpi(supabase, config, runId, now)],
    ] as const) {
      try {
        checks[name] = await fn();
      } catch (e) {
        failures[name] = errObj(e);
        log("error", `Check ${name} failed`, { runId, ...errObj(e) });
      }
    }

    const ok = Object.keys(failures).length === 0;
    log(ok ? "info" : "error", "notification-cron done", { runId, checks, failures, ms: Date.now() - started });
    return json({ ok, runId, checks, failures, ms: Date.now() - started }, ok ? 200 : 500);
  } catch (e) {
    log("error", "Unhandled error", { runId, ...errObj(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
}

// --run-once oppure RUN_ONCE=true: esecuzione singola (GitHub Actions)
const RUN_ONCE = Deno.args.includes("--run-once") || (Deno.env.get("RUN_ONCE") || "").toLowerCase() === "true";

if (RUN_ONCE) {
  const secret = Deno.env.get("NOTIFICATION_CRON_SECRET");
  const req = new Request("http://localhost/notification-cron", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) },
  });
  const res = await runCron(req);
  console.log("[RUN_ONCE] status:", res.status);
  console.log("[RUN_ONCE] body:", await res.text().catch(() => ""));
  Deno.exit(res.ok ? 0 : 1);
}

serve((req) => runCron(req));
