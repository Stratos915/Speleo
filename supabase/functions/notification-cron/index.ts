// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

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
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
  return { error: String(e) };
}

function todayUTCString() {
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function runCron(req: Request) {
  const runId = crypto.randomUUID();
  const started = Date.now();

  try {
    // --- ENV ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

    const NOTIFICATION_CRON_SECRET =
      Deno.env.get("NOTIFICATION_CRON_SECRET")?.trim() || "";

    const EMAIL_WEBHOOK = Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK")?.trim() || "";
    const EMAIL_ADMIN = Deno.env.get("NOTIFICATION_ADMIN_EMAIL")?.trim() || "";
    const EMAIL_MAGAZZINIERE =
      Deno.env.get("NOTIFICATION_MAGAZZINIERE_EMAIL")?.trim() || "";
    const EMAIL_PRESIDENTE =
      Deno.env.get("NOTIFICATION_PRESIDENTE_EMAIL")?.trim() || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log("error", "Missing required env", {
        runId,
        hasUrl: Boolean(SUPABASE_URL),
        hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    // --- SECURITY (cron secret) ---
    if (NOTIFICATION_CRON_SECRET) {
      const bearer = getBearer(req);
      const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
      const ok =
        bearer === NOTIFICATION_CRON_SECRET || headerSecret === NOTIFICATION_CRON_SECRET;
      if (!ok) {
        log("warn", "Unauthorized (bad cron secret)", { runId });
        return json({ error: "Unauthorized (bad cron secret)" }, 401);
      }
    }

    // --- SUPABASE CLIENT ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const todayStr = todayUTCString();
    const KIND = "OVERDUE";

    // --- QUERY loans scaduti/oggi ---
    const { data: loans, error } = await supabase
      .from("loans")
      .select("id, uscita_id, reserved_until, borrower_contact, updated_at, created_at")
      .not("reserved_until", "is", null)
      .lte("reserved_until", todayStr);

    if (error) {
      log("error", "Supabase error: select loans", { runId, ...errObj(error) });
      return json({ ok: false, where: "select loans", error }, 500);
    }

    const allLoans = loans ?? [];
    const totalCount = allLoans.length;

    // --- STEP 2: idempotenza + filtro "solo nuovi" ---
    const newLoans: any[] = [];
    const newLoanIds: string[] = [];

    // Se la tabella notification_log non esiste ancora, non blocchiamo il cron:
    // eseguiamo come prima (senza idempotenza) e logghiamo l’errore.
    let idempotencyAvailable = true;

    for (const loan of allLoans) {
      const { error: insErr } = await supabase
        .from("notification_log")
        .insert({
          loan_id: loan.id,
          kind: KIND,
          status: "PENDING",
          message: "Detected by cron (pending send)",
          meta: { runId, date: todayStr, reserved_until: loan.reserved_until },
        });

      if (!insErr) {
        newLoans.push(loan);
        newLoanIds.push(loan.id);
        continue;
      }

      // 23505 = unique_violation → già notificato
      if ((insErr as any)?.code === "23505") {
        continue;
      }

      // 42P01 = undefined_table (Postgres) → tabella non esiste
      if ((insErr as any)?.code === "42P01") {
        idempotencyAvailable = false;
        log("warn", "notification_log table missing: proceeding without idempotency", {
          runId,
          code: (insErr as any)?.code,
          message: (insErr as any)?.message,
        });
        // fallback: includi tutti i prestiti (comportamento precedente)
        newLoans.splice(0, newLoans.length, ...allLoans);
        newLoanIds.splice(0, newLoanIds.length);
        break;
      }

      log("error", "notification_log insert failed", {
        runId,
        loanId: loan.id,
        ...errObj(insErr),
      });
      // non blocchiamo tutto: continuiamo sugli altri
    }

    const newCount = newLoans.length;

    // --- OPTIONAL: webhook ---
    let webhookNote = "Webhook not configured (skipped)";
    let webhookOk = true;
    let webhookStatus: number | null = null;
    let webhookBodyPreview = "";

    if (EMAIL_WEBHOOK && newCount > 0) {
      const payload = {
        type: "loans_due",
        date: todayStr,
        count: newCount,
        total_due_count: totalCount,
        recipients: {
          admin: EMAIL_ADMIN,
          magazziniere: EMAIL_MAGAZZINIERE,
          presidente: EMAIL_PRESIDENTE,
        },
        loans: newLoans,
        meta: { runId, kind: KIND },
      };

      const r = await fetch(EMAIL_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      webhookStatus = r.status;

      if (!r.ok) {
        webhookOk = false;
        const t = await r.text().catch(() => "");
        webhookBodyPreview = t.slice(0, 500);
        log("error", "Webhook failed", { runId, status: r.status, bodyPreview: webhookBodyPreview });
        webhookNote = "Webhook failed";
      } else {
        webhookNote = "Webhook triggered";
      }
    }

    // --- Aggiorna status nel log (solo se idempotenza attiva e abbiamo nuovi) ---
    if (idempotencyAvailable && newLoanIds.length > 0) {
      if (!EMAIL_WEBHOOK) {
        // webhook non configurato → SKIPPED
        await supabase
          .from("notification_log")
          .update({
            status: "SKIPPED",
            message: "Webhook not configured (skipped)",
          })
          .in("loan_id", newLoanIds)
          .eq("kind", KIND)
          .eq("status", "PENDING");
      } else if (EMAIL_WEBHOOK && newCount === 0) {
        // niente di nuovo: nulla da fare
      } else if (webhookOk) {
        await supabase
          .from("notification_log")
          .update({
            status: "SENT",
            message: "Webhook delivered successfully",
          })
          .in("loan_id", newLoanIds)
          .eq("kind", KIND)
          .eq("status", "PENDING");
      } else {
        await supabase
          .from("notification_log")
          .update({
            status: "ERROR",
            message: `Webhook failed (status ${webhookStatus})`,
            meta: { runId, date: todayStr, kind: KIND, webhookStatus, webhookBodyPreview },
          })
          .in("loan_id", newLoanIds)
          .eq("kind", KIND)
          .eq("status", "PENDING");
      }
    }

    const ms = Date.now() - started;
    log("info", "notification-cron OK", {
      runId,
      date: todayStr,
      totalCount,
      newCount,
      ms,
      webhookOk,
      webhookStatus,
    });

    return json({
      ok: true,
      runId,
      date: todayStr,
      total_due_count: totalCount,
      new_due_count: newCount,
      ms,
      webhook: {
        configured: Boolean(EMAIL_WEBHOOK),
        ok: webhookOk,
        status: webhookStatus,
        note: webhookNote,
      },
    });
  } catch (e) {
    log("error", "Unhandled error", { ...errObj(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
}

// --- RUN MODE ---
// Attiva RUN_ONCE con:
// - argomento: --run-once
// - env: RUN_ONCE=true
const RUN_ONCE =
  Deno.args.includes("--run-once") ||
  (Deno.env.get("RUN_ONCE") || "").toLowerCase() === "true";

if (RUN_ONCE) {
  const req = new Request("http://localhost/notification-cron", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(Deno.env.get("NOTIFICATION_CRON_SECRET")
        ? { "x-cron-secret": Deno.env.get("NOTIFICATION_CRON_SECRET")! }
        : {}),
    },
  });

  const res = await runCron(req);
  const body = await res.text().catch(() => "");

  console.log("[RUN_ONCE] status:", res.status);
  console.log("[RUN_ONCE] body:", body);

  Deno.exit(res.ok ? 0 : 1);
}

// Modalità Edge Function normale: HTTP server
serve((req) => runCron(req));
