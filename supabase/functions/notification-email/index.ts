// Riceve gli avvisi dal job notification-cron (GitHub Actions) e li invia per email via SMTP.
//
// * Non richiede JWT: l'autenticita' e' garantita dalla firma HMAC-SHA256 del corpo
//   (header x-speleo-signature), con il segreto NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET.
// * Gestisce i tre tipi di avviso: loans_due, uscite_rientro_superato, dpi_in_scadenza.
// * In modalita' di prova (test_run) non invia nulla e risponde solo con il riepilogo.
//
// Variabili richieste (Supabase -> Edge Functions -> Secrets):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE (facoltativa),
//   NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET (consigliata).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

function collectEmails(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values.flat(2)) {
    const email = String(value ?? "").trim();
    if (email && email.includes("@")) out.add(email);
  }
  return [...out];
}

type Message = { subject: string; body: string; to: string[] };

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

  return null;
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

  const message = buildMessage(payload);
  if (!message) {
    return json({ ok: true, skipped: "nessun contenuto da inviare", type: payload.type ?? null });
  }
  if (!message.to.length) {
    console.error("Nessun destinatario configurato");
    return json({ ok: false, error: "Nessun destinatario configurato" }, 200);
  }
  if (payload.test_run === true) {
    return json({ ok: true, test_run: true, type: payload.type, to: message.to, subject: message.subject });
  }

  const SMTP_HOST = Deno.env.get("SMTP_HOST")?.trim();
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 587);
  const SMTP_USER = Deno.env.get("SMTP_USER")?.trim();
  const SMTP_PASS = Deno.env.get("SMTP_PASS")?.trim();
  const SMTP_FROM = Deno.env.get("SMTP_FROM")?.trim();
  const SMTP_SECURE_ENV = Deno.env.get("SMTP_SECURE");
  const SMTP_SECURE = SMTP_SECURE_ENV !== undefined
    ? SMTP_SECURE_ENV.toLowerCase() === "true"
    : SMTP_PORT === 465;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || Number.isNaN(SMTP_PORT)) {
    return json({ error: "Missing SMTP configuration" }, 500);
  }

  const client = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_SECURE },
    auth: { username: SMTP_USER, password: SMTP_PASS },
  });

  try {
    await client.send({
      from: SMTP_FROM,
      to: message.to,
      subject: message.subject,
      content: `${message.body}\n\n--\nGestionale del Gruppo Speleologico Urbino (messaggio automatico)`,
    });
    return json({ ok: true, type: payload.type, destinatari: message.to.length });
  } catch (sendError) {
    console.error("Invio SMTP fallito", sendError);
    return json({ error: "SMTP send failed", details: String(sendError) }, 500);
  } finally {
    await client.close();
  }
});
