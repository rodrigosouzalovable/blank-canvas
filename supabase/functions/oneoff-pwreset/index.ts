import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONE_TIME_TOKEN = "7532ed73fac54ab22a0f44b138052bf5590eb240033ea988";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const body = await req.json().catch(() => ({}));
  if (body.token !== ONE_TIME_TOKEN) return new Response("forbidden", { status: 403 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await admin.auth.admin.updateUserById(
    "ee649720-b8ce-47a2-859e-100a3a9ae6bb",
    { password: "Rod35059505", email_confirm: true }
  );

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
