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
    // Accetta:
    // 1) Authorization: Bearer <secret>
    // 2) x-cron-secret: <secret>
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

    // --- LOGIC: prendi prestiti con reserved_until valorizzato e scaduti/oggi ---
    // reserved_until è DATE -> confrontiamo con YYYY-MM-DD
    const todayStr = todayUTCString();

    // ✅ TABELLA CORRETTA: public.loans
    const { data: loans, error } = await supabase
      .from("loans")
      .select("id, uscita_id, reserved_until, borrower_contact, updated_at, created_at")
      .not("reserved_until", "is", null)
      .lte("reserved_until", todayStr);

    if (error) {
      log("error", "Supabase error: select loans", { runId, ...errObj(error) });
      return json({ ok: false, where: "select loans", error }, 500);
    }

    const count = loans?.length || 0;

    // --- OPTIONAL: webhook (Make/Zapier/altro) ---
    // Se EMAIL_WEBHOOK è vuoto, non fa nulla (ma il cron risulta OK)
    if (EMAIL_WEBHOOK) {
      const payload = {
        type: "loans_due",
        date: todayStr,
        count,
        recipients: {
          admin: EMAIL_ADMIN,
          magazziniere: EMAIL_MAGAZZINIERE,
          presidente: EMAIL_PRESIDENTE,
        },
        loans,
        meta: { runId },
      };

      const r = await fetch(EMAIL_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        log("error", "Webhook failed", {
          runId,
          status: r.status,
          bodyPreview: t.slice(0, 500),
        });
        return json(
          { ok: false, where: "webhook", status: r.status, body: t.slice(0, 500) },
          502,
        );
      }
    }

    const ms = Date.now() - started;
    log("info", "notification-cron OK", { runId, date: todayStr, count, ms });

    return json({
      ok: true,
      runId,
      date: todayStr,
      count,
      ms,
      note: EMAIL_WEBHOOK ? "Webhook triggered" : "Webhook not configured (skipped)",
    });
  } catch (e) {
    log("error", "Unhandled error", { ...errObj(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
}

// --- RUN MODE ---
// In GitHub Actions il server non deve restare in ascolto.
// Attiva RUN_ONCE con:
// - argomento: --run-once
// - env: RUN_ONCE=true
const RUN_ONCE =
  Deno.args.includes("--run-once") ||
  (Deno.env.get("RUN_ONCE") || "").toLowerCase() === "true";

if (RUN_ONCE) {
  // Creiamo una Request fittizia: in RUN_ONCE puoi anche passare il secret via env,
  // ma qui manteniamo comportamento compatibile senza richiedere header.
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

  // Termina il processo: GitHub Actions non rimane appeso.
  Deno.exit(res.ok ? 0 : 1);
}

// Modalità Edge Function normale: HTTP server
serve((req) => runCron(req));
