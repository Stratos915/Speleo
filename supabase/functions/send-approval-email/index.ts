// Invia l'email di benvenuto quando un amministratore approva un nuovo socio.
// Richiede il token dell'utente che approva: solo admin e presidente possono usarla.
// L'invio usa nodemailer: denomailer non completava l'autenticazione con Gmail.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.14";
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

La tua richiesta di accesso al gestionale del Gruppo Speleologico Urbino e' stata approvata.
Puoi entrare da qui:
${appUrl}

Al primo accesso ti verra' chiesto di scegliere una password personale.
Sul telefono puoi aggiungere l'app alla schermata Home per aprirla come una normale app.

Buone esplorazioni.

--
Gruppo Speleologico Urbino (messaggio automatico)`;
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

  if (!["admin", "presidente"].includes(String(profile?.role ?? ""))) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  if (!email) return json({ error: "Missing email" }, 400);

  const appUrl = String(body?.app_url ?? "").trim() || "https://speleoapp.netlify.app";
  const firstName = String(body?.first_name ?? "").trim();
  const lastName = String(body?.last_name ?? "").trim();

  const SMTP_HOST = Deno.env.get("SMTP_HOST")?.trim();
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 465);
  const SMTP_USER = Deno.env.get("SMTP_USER")?.trim();
  const SMTP_PASS = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s+/g, "");
  const SMTP_FROM = Deno.env.get("SMTP_FROM")?.trim();
  const SMTP_SECURE_ENV = Deno.env.get("SMTP_SECURE");
  const SMTP_SECURE = SMTP_SECURE_ENV !== undefined
    ? SMTP_SECURE_ENV.toLowerCase() === "true"
    : SMTP_PORT === 465;

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

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "Accesso approvato \u00b7 Gestionale GSU",
      text: buildEmailBody({ firstName, lastName, appUrl }),
    });

    return json({ ok: true, accettati: info?.accepted?.length ?? null });
  } catch (sendError) {
    console.error("SMTP send failed", sendError);
    return json({ error: "SMTP send failed", details: String(sendError) }, 500);
  }
});
