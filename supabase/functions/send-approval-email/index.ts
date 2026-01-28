import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function buildEmailBody({ firstName, lastName, appUrl }: { firstName: string; lastName: string; appUrl: string }) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const greeting = name ? `Ciao ${name},` : "Ciao,";
  return `${greeting}

La tua richiesta di accesso è stata approvata.
Puoi accedere all'app qui:
${appUrl}

Grazie.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const jwt = getBearer(req);
  if (!jwt) return json({ error: "Missing authorization token" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!["admin", "presidente"].includes(profile?.role ?? "")) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  if (!email) return json({ error: "Missing email" }, 400);

  const appUrl = String(body?.app_url ?? "").trim() || "https://creative-gelato-81d26e.netlify.app";
  const firstName = String(body?.first_name ?? "").trim();
  const lastName = String(body?.last_name ?? "").trim();

  const SMTP_HOST = Deno.env.get("SMTP_HOST")?.trim();
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 587);
  const SMTP_USER = Deno.env.get("SMTP_USER")?.trim();
  const SMTP_PASS = Deno.env.get("SMTP_PASS")?.trim();
  const SMTP_FROM = Deno.env.get("SMTP_FROM")?.trim();
  const SMTP_SECURE = (Deno.env.get("SMTP_SECURE") ?? "").toLowerCase() === "true";

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return json({ error: "Missing SMTP configuration" }, 500);
  }

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_SECURE,
    },
    auth: {
      username: SMTP_USER,
      password: SMTP_PASS,
    },
  });

  try {
    const subject = "Accesso approvato – Speleo App";
    const content = buildEmailBody({ firstName, lastName, appUrl });
    await client.send({
      from: SMTP_FROM,
      to: email,
      subject,
      content,
    });
  } finally {
    await client.close();
  }

  return json({ ok: true });
});
