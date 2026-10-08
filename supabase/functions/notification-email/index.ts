// Riceve gli avvisi dal job notification-cron (GitHub Actions) e li invia per email via SMTP.
//
// * Non richiede JWT: l'autenticita' e' garantita dalla firma HMAC-SHA256 del corpo
//   (header x-speleo-signature), con il segreto NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET.
// * Tipi gestiti: loans_due, uscite_rientro_superato, movimenti_prestiti, dpi_in_scadenza,
//   nuova_uscita e uscite_cambiate (avvisi a tutti i soci, in copia nascosta),
//   prestito_promemoria (al socio che ha il materiale, il giorno prima della riconsegna).
// * In modalita' di prova (test_run) non invia nulla e risponde solo con il riepilogo.
// * Con {"diag": true} restituisce la configurazione SMTP in uso, senza la password.
// * L'invio usa nodemailer: la libreria denomailer non completava l'autenticazione
//   con Gmail (errore 530) e non gestisce STARTTLS in questo runtime.
//
// Variabili richieste (Supabase -> Edge Functions -> Secrets):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE,
//   NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET.
// Nota: i provider di posta personale (Yahoo, ad esempio) possono rifiutare gli invii
// dai server cloud con errore 554. Gmail con password per le app funziona.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.14";

// Destinatari in copia nascosta per singolo messaggio (limite prudente per Gmail).
const BCC_BATCH = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function expectedSignature(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

function formatDateIt(value: unknown) {
  const text = String(value ?? "");
  if (!text) return "data non indicata";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayIt(value: unknown) {
  const text = String(value ?? "");
  if (!text) return "data non indicata";
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatWeekdayIt(value: unknown) {
  const text = String(value ?? "");
  if (!text) return "data non indicata";
  const date = new Date(`${text.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatOra(value: unknown) {
  const text = String(value ?? "");
  const match = /^(\d{2}):(\d{2})/.exec(text);
  return match ? `${match[1]}:${match[2]}` : "";
}

function collectEmails(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values.flat(2)) {
    const email = String(value ?? "").trim();
    if (email && email.includes("@")) out.add(email);
  }
  return [...out];
}

type Message = { subject: string; body: string; to: string[]; bcc?: string[] };

function buildMessage(payload: Record<string, any>): Message | null {
  const recipients = payload.recipients ?? {};
  const admin = recipients.admin;
  const magazziniere = recipients.magazziniere;
  const presidente = recipients.presidente;

  if (payload.type === "loans_due") {
    const loans: any[] = Array.isArray(payload.loans) ? payload.loans : [];
    if (!loans.length) return null;
    const righe = loans.map((loan) =>
      `- ${loan.borrower_name ?? "socio non indicato"}: ${loan.quantity ?? "?"} pezzi, rientro previsto il ${formatDayIt(loan.reserved_until)}`
    );
    return {
      subject: `GSU · ${loans.length} ${loans.length === 1 ? "prestito" : "prestiti"} da riconsegnare`,
      to: collectEmails([magazziniere, admin, presidente, loans.map((loan) => loan.borrower_email)]),
      body: [
        "Questi prestiti risultano ancora aperti oltre la data di rientro:",
        "",
        ...righe,
        "",
        "Puoi chiuderli dall'app, nella sezione Prestiti → Storico prestiti.",
      ].join("\n"),
    };
  }

  if (payload.type === "uscite_rientro_superato") {
    const uscite: any[] = Array.isArray(payload.uscite) ? payload.uscite : [];
    if (!uscite.length) return null;
    const righe = uscite.map((uscita) =>
      `- "${uscita.titolo ?? "uscita"}" a ${uscita.luogo ?? "luogo non indicato"}: rientro previsto per ${formatDateIt(uscita.rientro_previsto)}, responsabile ${uscita.responsabile_nome ?? "non indicato"}`
    );
    return {
      subject: "GSU · Rientro uscita oltre l'orario previsto",
      to: collectEmails([presidente, admin, recipients.responsabili]),
      body: [
        "Queste uscite risultano ancora aperte oltre l'orario di rientro previsto:",
        "",
        ...righe,
        "",
        `Tolleranza applicata: ${payload.tolerance_minutes ?? 60} minuti.`,
        "",
        "Se il gruppo e' rientrato, chiudete l'uscita nell'app per fermare i promemoria.",
        "Questo messaggio e' un promemoria automatico e non sostituisce le procedure di",
        "sicurezza del gruppo: in caso di ritardo reale o di emergenza chiamate il 112.",
      ].join("\n"),
    };
  }

  if (payload.type === "movimenti_prestiti") {
    const items: any[] = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return null;
    const righe = items.map((item) => {
      const quando = formatDateIt(item.quando);
      if (item.tipo === "rientro") {
        const mancanti = Number(item.mancanti ?? 0);
        const coda = mancanti > 0 ? ` — ATTENZIONE: ${mancanti} pezzi mancanti` : "";
        return `- RIENTRO  ${item.materiale} x${item.quantita} da ${item.socio ?? "socio"} (${quando})${coda}`;
      }
      const note = item.note ? ` — ${item.note}` : "";
      return `- USCITA   ${item.materiale} x${item.quantita} a ${item.socio ?? "socio"} (${quando})${note}`;
    });
    const consegne = items.filter((item) => item.tipo !== "rientro").length;
    const rientri = items.length - consegne;
    return {
      subject: `GSU · Movimenti magazzino: ${consegne} in uscita, ${rientri} in rientro`,
      to: collectEmails([magazziniere, admin]),
      body: [
        "Movimenti di materiale registrati nell'ultimo controllo:",
        "",
        ...righe,
        "",
        "Il dettaglio completo e' in Prestiti → Storico prestiti.",
      ].join("\n"),
    };
  }

  if (payload.type === "dpi_in_scadenza") {
    const items: any[] = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return null;
    const righe = items.map((item) =>
      `- ${item.nome ?? "materiale"}: ${item.tipo === "fine_vita" ? "fine vita" : "ispezione"} il ${formatDayIt(item.data)}`
    );
    return {
      subject: `GSU · ${items.length} DPI da controllare`,
      to: collectEmails([magazziniere, admin, presidente]),
      body: [
        "Questi materiali hanno un'ispezione o una fine vita in scadenza:",
        "",
        ...righe,
        "",
        "I dispositivi oltre la fine vita non vanno usati e vanno ritirati dal magazzino.",
      ].join("\n"),
    };
  }

  // Avviso a tutti i soci: gli indirizzi vanno in copia nascosta, nessuno vede gli altri.
  if (payload.type === "nuova_uscita") {
    const uscite: any[] = Array.isArray(payload.uscite) ? payload.uscite : [];
    if (!uscite.length) return null;
    const appUrl = String(payload.app_url ?? "https://speleoapp.netlify.app").replace(/\/+$/, "");
    const blocchi = uscite.map((uscita) => {
      const ora = formatOra(uscita.ora);
      return [
        `• ${uscita.titolo ?? "Uscita"}`,
        `  Quando: ${formatWeekdayIt(uscita.data)}${ora ? ` alle ${ora}` : ""}`,
        `  Dove: ${uscita.luogo || "da definire"}`,
        uscita.tipo ? `  Tipo: ${uscita.tipo}` : null,
        uscita.responsabile_nome ? `  Responsabile: ${uscita.responsabile_nome}` : null,
        `  Dettagli: ${appUrl}/uscite/${uscita.id}`,
      ].filter(Boolean).join("\n");
    });
    const primo = uscite[0];
    return {
      subject: uscite.length === 1
        ? `GSU · Nuova uscita: ${primo.titolo ?? "uscita"} (${formatDayIt(primo.data)})`
        : `GSU · ${uscite.length} nuove uscite in calendario`,
      to: [],
      bcc: collectEmails([recipients.soci]),
      body: [
        uscite.length === 1
          ? "È stata aggiunta una nuova uscita al calendario del gruppo:"
          : "Sono state aggiunte nuove uscite al calendario del gruppo:",
        "",
        blocchi.join("\n\n"),
        "",
        `Calendario completo: ${appUrl}/calendario`,
        "",
        "Non vuoi più ricevere questi avvisi? Disattivali dal pulsante «🔔 Avvisi»",
        "in alto nell'app, sotto il tuo nome.",
      ].join("\n"),
    };
  }

  // Uscite modificate o annullate: a tutti i soci, in copia nascosta.
  if (payload.type === "uscite_cambiate") {
    const items: any[] = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return null;
    const appUrl = String(payload.app_url ?? "https://speleoapp.netlify.app").replace(/\/+$/, "");
    const blocchi = items.map((item) => {
      const ora = formatOra(item.ora);
      if (item.esito === "annullata") {
        return [
          `• ANNULLATA: ${item.titolo ?? "Uscita"}`,
          `  Era prevista ${formatWeekdayIt(item.data)}${ora ? ` alle ${ora}` : ""}${item.luogo ? ` a ${item.luogo}` : ""}.`,
        ].join("\n");
      }
      const cambi: any[] = Array.isArray(item.cambi) ? item.cambi : [];
      return [
        `• MODIFICATA: ${item.titolo ?? "Uscita"}`,
        ...cambi.map((cambio) => `  ${cambio.etichetta}: ${cambio.prima} → ${cambio.dopo}`),
        `  Nuovo programma: ${formatWeekdayIt(item.data)}${ora ? ` alle ${ora}` : ""}, ${item.luogo || "luogo da definire"}`,
        `  Dettagli: ${appUrl}/uscite/${item.id}`,
      ].join("\n");
    });
    const primo = items[0];
    const annullate = items.filter((item) => item.esito === "annullata").length;
    let subject: string;
    if (items.length === 1) {
      subject = primo.esito === "annullata"
        ? `GSU · Uscita annullata: ${primo.titolo ?? "uscita"} (${formatDayIt(primo.data)})`
        : `GSU · Uscita modificata: ${primo.titolo ?? "uscita"} (${formatDayIt(primo.data)})`;
    } else {
      subject = annullate === items.length
        ? `GSU · ${items.length} uscite annullate`
        : annullate
        ? `GSU · Cambi in calendario: ${items.length - annullate} modificate, ${annullate} annullate`
        : `GSU · ${items.length} uscite modificate`;
    }
    return {
      subject,
      to: [],
      bcc: collectEmails([recipients.soci]),
      body: [
        items.length === 1 ? "C'è un cambiamento nel calendario del gruppo:" : "Ci sono cambiamenti nel calendario del gruppo:",
        "",
        blocchi.join("\n\n"),
        "",
        `Calendario completo: ${appUrl}/calendario`,
        "",
        "Non vuoi più ricevere questi avvisi? Disattivali dal pulsante «🔔 Avvisi»",
        "in alto nell'app, sotto il tuo nome.",
      ].join("\n"),
    };
  }

  // Promemoria personale: il giorno prima della riconsegna del materiale.
  if (payload.type === "prestito_promemoria") {
    const prestito = payload.prestito ?? {};
    const destinatario = collectEmails([recipients.socio]);
    if (!destinatario.length) return null;
    const appUrl = String(payload.app_url ?? "https://speleoapp.netlify.app").replace(/\/+$/, "");
    return {
      subject: `GSU · Promemoria: riconsegna ${prestito.materiale ?? "materiale"} entro ${formatDayIt(prestito.scadenza)}`,
      to: destinatario,
      body: [
        `Ciao ${prestito.socio ?? ""},`.replace(" ,", ","),
        "",
        "ti ricordiamo che domani va riconsegnato il materiale che hai in prestito:",
        "",
        `• ${prestito.materiale ?? "materiale"} × ${prestito.quantita ?? 1}`,
        `  Riconsegna entro: ${formatWeekdayIt(prestito.scadenza)}`,
        "",
        "Se ti serve più tempo, avvisa il magazziniere.",
        "",
        `App: ${appUrl}`,
      ].join("\n"),
    };
  }

  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const secret = Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET")?.trim() ?? "";

  if (secret) {
    const provided = (req.headers.get("x-speleo-signature") ?? "").trim();
    const expected = await expectedSignature(secret, rawBody);
    if (provided !== expected) {
      console.error("Firma non valida");
      return json({ error: "Invalid signature" }, 401);
    }
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const SMTP_HOST = Deno.env.get("SMTP_HOST")?.trim();
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 465);
  const SMTP_USER = Deno.env.get("SMTP_USER")?.trim();
  const SMTP_PASS = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s+/g, "");
  const SMTP_FROM = Deno.env.get("SMTP_FROM")?.trim();
  const SMTP_SECURE_ENV = Deno.env.get("SMTP_SECURE");
  const SMTP_SECURE = SMTP_SECURE_ENV !== undefined
    ? SMTP_SECURE_ENV.toLowerCase() === "true"
    : SMTP_PORT === 465;

  // Diagnostica: riporta come e' configurato l'invio, senza rivelare la password.
  if (payload.diag === true) {
    const mask = (value?: string) => {
      if (!value) return null;
      const [name, domain] = value.split("@");
      return domain ? `${name.slice(0, 3)}***@${domain}` : `${value.slice(0, 3)}***`;
    };
    return json({
      host: SMTP_HOST ?? null,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      user: mask(SMTP_USER),
      from: mask(SMTP_FROM),
      lunghezza_password: SMTP_PASS.length,
      firma_verificata: Boolean(secret),
    });
  }

  const message = buildMessage(payload);
  if (!message) {
    return json({ ok: true, skipped: "nessun contenuto da inviare", type: payload.type ?? null });
  }
  const bcc = message.bcc ?? [];
  if (!message.to.length && !bcc.length) {
    console.error("Nessun destinatario configurato");
    return json({ ok: false, error: "Nessun destinatario configurato" }, 200);
  }
  if (payload.test_run === true) {
    return json({
      ok: true,
      test_run: true,
      type: payload.type,
      to: message.to,
      bcc_count: bcc.length,
      subject: message.subject,
    });
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || Number.isNaN(SMTP_PORT)) {
    return json({ error: "Missing SMTP configuration" }, 500);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const text = `${message.body}\n\n--\nGestionale del Gruppo Speleologico Urbino (messaggio automatico)`;

    // Con la copia nascosta il destinatario visibile e' il mittente stesso;
    // i soci sono divisi in gruppi per restare nei limiti del provider.
    const invii = bcc.length ? chunk(bcc, BCC_BATCH).map((gruppo) => ({ to: message.to, bcc: gruppo })) : [{ to: message.to, bcc: [] }];
    let accettati = 0;
    for (const invio of invii) {
      const info = await transporter.sendMail({
        from: SMTP_FROM,
        to: invio.to.length ? invio.to.join(", ") : SMTP_FROM,
        bcc: invio.bcc.length ? invio.bcc.join(", ") : undefined,
        subject: message.subject,
        text,
      });
      accettati += info?.accepted?.length ?? 0;
    }

    return json({
      ok: true,
      type: payload.type,
      destinatari: message.to.length + bcc.length,
      messaggi: invii.length,
      accettati,
    });
  } catch (sendError) {
    console.error("Invio SMTP fallito", sendError);
    return json({ error: "SMTP send failed", details: String(sendError) }, 500);
  }
});
