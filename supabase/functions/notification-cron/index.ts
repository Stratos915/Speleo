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

serve(async (req) => {
  try {
    // --- ENV ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

    const NOTIFICATION_CRON_SECRET =
      Deno.env.get("NOTIFICATION_CRON_SECRET")?.trim() || "";

    const EMAIL_WEBHOOK = Deno.env.get("NOTIFICATION_EMAIL_WEBHOOK")?.trim() || "";
    const EMAIL_ADMIN = Deno.env.get("NOTIFICATION_ADMIN_EMAIL")?.trim() || "";
    const EMAIL_MAGAZZINIERE = Deno.env.get("NOTIFICATION_MAGAZZINIERE_EMAIL")?.trim() ||
      "";
    const EMAIL_PRESIDENTE = Deno.env.get("NOTIFICATION_PRESIDENTE_EMAIL")?.trim() || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    // --- SECURITY (cron secret) ---
    // Accetta:
    // 1) Authorization: Bearer <secret>
    // 2) x-cron-secret: <secret>
    if (NOTIFICATION_CRON_SECRET) {
      const bearer = getBearer(req);
      const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
      const ok = bearer === NOTIFICATION_CRON_SECRET || headerSecret === NOTIFICATION_CRON_SECRET;
      if (!ok) return json({ error: "Unauthorized (bad cron secret)" }, 401);
    }

    // --- SUPABASE CLIENT ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // --- LOGIC: prendi prestiti con reserved_until valorizzato e scaduti/oggi ---
    // reserved_until è DATE -> confrontiamo con YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // ✅ TABELLA CORRETTA: public.loans
    const { data: loans, error } = await supabase
      .from("loans")
      .select("id, uscita_id, reserved_until, borrower_contact, updated_at, created_at")
      .not("reserved_until", "is", null)
      .lte("reserved_until", todayStr);

    if (error) {
      console.error("[notification-cron] Supabase error:", error);
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
      };

      const r = await fetch(EMAIL_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("[notification-cron] Webhook failed:", r.status, t);
        return json(
          { ok: false, where: "webhook", status: r.status, body: t.slice(0, 500) },
          502,
        );
      }
    }

    console.log("[notification-cron] OK", { date: todayStr, count });

    return json({
      ok: true,
      date: todayStr,
      count,
      note: EMAIL_WEBHOOK ? "Webhook triggered" : "Webhook not configured (skipped)",
    });
  } catch (e) {
    console.error("[notification-cron] Unhandled error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
