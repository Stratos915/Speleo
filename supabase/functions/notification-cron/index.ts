// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

/* =======================
   ENV & SETUP
======================= */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const NOTIFICATION_CRON_SECRET =
  Deno.env.get("NOTIFICATION_CRON_SECRET")?.trim() || "";

const EMAIL_WEBHOOK =
  Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK")?.trim() || "";

const EMAIL_ADMIN = Deno.env.get("NOTIFICATION_ADMIN_EMAIL")?.trim() || "";
const EMAIL_MAGAZZINIERE =
  Deno.env.get("NOTIFICATION_MAGAZZINIERE_EMAIL")?.trim() || "";
const EMAIL_PRESIDENTE =
  Deno.env.get("NOTIFICATION_PRESIDENTE_EMAIL")?.trim() || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function log(...args: any[]) {
  console.log("[notification-cron]", ...args);
}

/* =======================
   HELPERS
======================= */

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function findExistingNotification(
  audience: string,
  type: string,
  targetRole: string | null,
  meta: Record<string, any>,
) {
  let q = supabase
    .from("notifications")
    .select("id")
    .eq("audience", audience)
    .eq("type", type)
    .contains("meta", meta)
    .limit(1);

  q = targetRole ? q.eq("target_role", targetRole) : q.is("target_role", null);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function createNotification(
  payload: Record<string, any>,
  meta: Record<string, any>,
) {
  const exists = await findExistingNotification(
    payload.audience,
    payload.type,
    payload.target_role ?? null,
    meta,
  );
  if (exists) return exists.id;

  const { data, error } = await supabase
    .from("notifications")
    .insert([{ ...payload, meta }])
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/* =======================
   GENERATORS
======================= */

async function generateLoanNotifications() {
  const today = new Date();

  const { data, error } = await supabase
    .from("loans")
    .select("id, borrower_name, reserved_until")
    .eq("status", "in_corso");

  if (error) throw error;

  let created = 0;

  for (const loan of data ?? []) {
    const due = parseDate(loan.reserved_until);
    if (!due || due >= today) continue;

    await createNotification(
      {
        audience: "admin",
        target_role: "magazziniere",
        type: "danger",
        title: "Prestito materiale scaduto",
        message:
          `Il prestito assegnato a ${loan.borrower_name ?? "socio"} doveva rientrare il ${due.toLocaleDateString("it-IT")}.`,
        link: "/prestito-avanzato",
        due_date: due.toISOString(),
      },
      { source_type: "loan", source_id: loan.id },
    );

    created++;
  }

  return created;
}

async function generateLibraryNotifications() {
  const today = new Date();

  const { data, error } = await supabase
    .from("library_loans")
    .select("id, borrower_name, loaned_at")
    .eq("status", "active");

  if (error) throw error;

  let created = 0;

  for (const loan of data ?? []) {
    const loanedAt = parseDate(loan.loaned_at);
    if (!loanedAt) continue;

    const due = new Date(loanedAt);
    due.setDate(due.getDate() + 30);
    if (due >= today) continue;

    await createNotification(
      {
        audience: "admin",
        target_role: "admin",
        type: "warning",
        title: "Libro non restituito",
        message:
          `Il libro prestato a ${loan.borrower_name ?? "socio"} non è stato restituito.`,
        link: "/biblioteca",
        due_date: due.toISOString(),
      },
      { source_type: "library_loan", source_id: loan.id },
    );

    created++;
  }

  return created;
}

/* =======================
   EMAIL DELIVERY
======================= */

function resolveRecipients(n: any): string[] {
  const out: string[] = [];

  if (n.target_role === "magazziniere" && EMAIL_MAGAZZINIERE) {
    out.push(EMAIL_MAGAZZINIERE);
  } else if (n.target_role === "presidente" && EMAIL_PRESIDENTE) {
    out.push(EMAIL_PRESIDENTE);
  } else if (EMAIL_ADMIN) {
    out.push(EMAIL_ADMIN);
  }

  return [...new Set(out)];
}

async function sendEmail(n: any, to: string[]) {
  if (!EMAIL_WEBHOOK) {
    log("EMAIL_WEBHOOK missing → skip email");
    return;
  }

  const res = await fetch(EMAIL_WEBHOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(NOTIFICATION_CRON_SECRET
        ? { "x-cron-secret": NOTIFICATION_CRON_SECRET }
        : {}),
    },
    body: JSON.stringify({
      to,
      subject: `[Speleo] ${n.title}`,
      message: n.message,
      link: n.link,
    }),
  });

  if (!res.ok) {
    throw new Error(`Email webhook failed (${res.status})`);
  }
}

async function deliverPendingEmails() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .lte("due_date", now)
    .is("sent_email_at", null);

  if (error) throw error;

  let sent = 0;

  for (const n of data ?? []) {
    const recipients = resolveRecipients(n);
    if (!recipients.length) continue;

    await sendEmail(n, recipients);

    await supabase
      .from("notifications")
      .update({ sent_email_at: new Date().toISOString() })
      .eq("id", n.id);

    sent++;
  }

  return sent;
}

/* =======================
   MAIN
======================= */

async function runCron() {
  log("start");
  const loans = await generateLoanNotifications();
  const library = await generateLibraryNotifications();
  const emails = await deliverPendingEmails();
  log("done", { loans, library, emails });
  return { ok: true, loans, library, emails };
}

/* =======================
   ENTRYPOINTS
======================= */

if (import.meta.main) {
  runCron().catch((e) => {
    console.error("[notification-cron]", e);
    Deno.exit(1);
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (NOTIFICATION_CRON_SECRET && auth !== `Bearer ${NOTIFICATION_CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runCron();
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("[notification-cron]", e);
    return new Response(
      JSON.stringify({ error: e.message ?? String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
