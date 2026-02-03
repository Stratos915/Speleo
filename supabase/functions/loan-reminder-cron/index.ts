import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

function json(body: unknown, status = 200) {
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

function toYmdUTC(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDateIt(value: string) {
  const d = parseDateOnly(value);
  if (!d) return value;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

async function insertLog(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from("notification_log").insert(payload);
  if (!error) return true;
  if ((error as any)?.code === "23505") return false;
  throw error;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const CRON_SECRET = Deno.env.get("LOAN_REMINDER_CRON_SECRET")?.trim();

  const SMTP_HOST = Deno.env.get("SMTP_HOST")?.trim();
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 587);
  const SMTP_USER = Deno.env.get("SMTP_USER")?.trim();
  const SMTP_PASS = Deno.env.get("SMTP_PASS")?.trim();
  const SMTP_FROM = Deno.env.get("SMTP_FROM")?.trim();
  const SMTP_SECURE_ENV = Deno.env.get("SMTP_SECURE");
  const SMTP_SECURE =
    SMTP_SECURE_ENV !== undefined
      ? SMTP_SECURE_ENV.toLowerCase() === "true"
      : SMTP_PORT === 465;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (CRON_SECRET) {
    const bearer = getBearer(req);
    const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
    if (bearer !== CRON_SECRET && headerSecret !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || Number.isNaN(SMTP_PORT)) {
    return json({ error: "Missing SMTP configuration" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const todayStr = toYmdUTC(new Date());

  const { data: loans, error: loansError } = await supabase
    .from("loans")
    .select("id, uscita_id, delivered_at, created_at, borrower_email, borrower_name, equipment_id, quantity, status")
    .eq("status", "in_corso");

  if (loansError) {
    return json({ error: "Failed to load loans", details: loansError.message }, 500);
  }

  const loansList = loans ?? [];
  const uscitaIds = [...new Set(loansList.map((l) => l.uscita_id).filter(Boolean))];
  const equipmentIds = [...new Set(loansList.map((l) => l.equipment_id).filter(Boolean))];

  const { data: uscite } = uscitaIds.length
    ? await supabase.from("uscite").select("id, titolo, data").in("id", uscitaIds)
    : { data: [] };
  const { data: equipment } = equipmentIds.length
    ? await supabase.from("equipment").select("equipment_id, name").in("equipment_id", equipmentIds)
    : { data: [] };

  const usciteMap = new Map<string, { titolo?: string; data?: string }>();
  (uscite ?? []).forEach((u: any) => usciteMap.set(String(u.id), u));
  const equipmentMap = new Map<string, string>();
  (equipment ?? []).forEach((e: any) => equipmentMap.set(String(e.equipment_id), e.name));

  const client = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_SECURE },
    auth: { username: SMTP_USER, password: SMTP_PASS },
  });

  const adminRoles = ["admin", "presidente", "magazziniere"];
  const results = { emailsSent: 0, notifications: 0 };

  try {
    for (const loan of loansList) {
      const uscita = loan.uscita_id ? usciteMap.get(String(loan.uscita_id)) : null;
      if (!uscita?.data) continue;
      const uscitaDate = parseDateOnly(uscita.data);
      if (!uscitaDate) continue;

      const dueDate = addDays(uscitaDate, 7);
      const dueStr = toYmdUTC(dueDate);
      const remindStr = toYmdUTC(addDays(uscitaDate, 6));

      const deliveredDate = parseDateOnly(loan.delivered_at || loan.created_at);
      const after10Str = deliveredDate ? toYmdUTC(addDays(deliveredDate, 10)) : null;

      const isDueSoon = todayStr === remindStr;
      const isAfter10 = after10Str && todayStr === after10Str;
      const isOverdue = todayStr > dueStr;

      const equipmentName = equipmentMap.get(String(loan.equipment_id)) ?? "materiale";

      // Email 1 giorno prima della scadenza
      if (isDueSoon && loan.borrower_email) {
        const inserted = await insertLog(supabase, {
          loan_id: loan.id,
          kind: "email_due_1d",
          target_email: loan.borrower_email,
          status: "PENDING",
          meta: { due_date: dueStr },
        });
        if (inserted) {
          const subject = "Promemoria restituzione materiale";
          const body = `Ciao ${loan.borrower_name ?? ""},

Ti ricordiamo di riconsegnare il materiale "${equipmentName}" entro il ${formatDateIt(dueStr)}.
Uscita: ${uscita.titolo ?? "Uscita speleo"}.

Grazie.`;
          await client.send({ from: SMTP_FROM, to: loan.borrower_email, subject, content: body });
          results.emailsSent += 1;
        }
      }

      // Email 10 giorni dopo il prestito
      if (isAfter10 && loan.borrower_email) {
        const inserted = await insertLog(supabase, {
          loan_id: loan.id,
          kind: "email_after_10d",
          target_email: loan.borrower_email,
          status: "PENDING",
          meta: { due_date: dueStr, delivered_at: loan.delivered_at },
        });
        if (inserted) {
          const subject = "Restituzione materiale in ritardo";
          const body = `Ciao ${loan.borrower_name ?? ""},

Risulta ancora aperto il prestito per "${equipmentName}" dell'uscita "${uscita.titolo ?? "Uscita speleo"}".
Ti chiediamo di riconsegnare il materiale appena possibile.

Grazie.`;
          await client.send({ from: SMTP_FROM, to: loan.borrower_email, subject, content: body });
          results.emailsSent += 1;
        }
      }

      // Notifiche admin (scadenza imminente)
      if (isDueSoon) {
        for (const role of adminRoles) {
          const inserted = await insertLog(supabase, {
            loan_id: loan.id,
            kind: "notif_due_soon",
            target_role: role,
            status: "PENDING",
            meta: { due_date: dueStr },
          });
          if (!inserted) continue;
          const { error: notifErr } = await supabase.from("notifications").insert({
            audience: "admin",
            target_role: role,
            type: "warning",
            title: "Prestito in scadenza",
            message: `Materiale "${equipmentName}" in scadenza il ${formatDateIt(dueStr)}.`,
            link: "/prestito-avanzato",
            due_date: dueDate.toISOString(),
            meta: { loan_id: loan.id, uscita_id: loan.uscita_id },
          });
          if (!notifErr) results.notifications += 1;
        }
      }

      // Notifiche admin (scaduto)
      if (isOverdue) {
        for (const role of adminRoles) {
          const inserted = await insertLog(supabase, {
            loan_id: loan.id,
            kind: "notif_overdue",
            target_role: role,
            status: "PENDING",
            meta: { due_date: dueStr },
          });
          if (!inserted) continue;
          const { error: notifErr } = await supabase.from("notifications").insert({
            audience: "admin",
            target_role: role,
            type: "danger",
            title: "Prestito oltre scadenza",
            message: `Materiale "${equipmentName}" doveva rientrare il ${formatDateIt(dueStr)}.`,
            link: "/prestito-avanzato",
            due_date: dueDate.toISOString(),
            meta: { loan_id: loan.id, uscita_id: loan.uscita_id },
          });
          if (!notifErr) results.notifications += 1;
        }
      }
    }
  } finally {
    await client.close();
  }

  return json({ ok: true, ...results });
});
