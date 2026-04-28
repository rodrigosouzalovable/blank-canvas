// Edge function: Reconfigure ALL UAZAPI webhooks to exclude groups, broadcasts, and own-msg echoes.
// Purpose: Stop credit bleed caused by webhook spam from group chats.
// Trigger: Manual via "Pânico" button in Monitor de Envios.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;

    const { data: instances, error } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token")
      .eq("ativo", true)
      .limit(typeof body?.limit === "number" && body.limit > 0 ? body.limit : 500);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ ok: true, total: 0, success: 0, failed: 0, details: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Restricted webhook config: only direct messages, no groups, no broadcasts.
    // Keep payload minimal — extra fields break some UAZAPI server versions
    // and cause silent webhook failures (DMs never delivered).
    const restrictedPayload = JSON.stringify({
      url: webhookUrl,
      events: ["messages"],
      excludeGroupMessages: true,
      excludeBroadcast: true,
    });

    // Process all in parallel with 15s timeout each
    const tasks = instances.map(async (inst) => {
      const base = inst.server_url.replace(/\/+$/, "");
      const token = inst.instance_token;
      const attempts = [
        { url: `${base}/webhook/${token}`, headers: { "Content-Type": "application/json" } },
        { url: `${base}/webhook`, headers: { "Content-Type": "application/json", token } },
        { url: `${base}/globalwebhook`, headers: { "Content-Type": "application/json", admintoken: adminToken } },
      ];

      let lastErr = "";
      for (const a of attempts) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(a.url, {
            method: "POST", headers: a.headers, body: restrictedPayload, signal: ctrl.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            console.log(`[DISABLE-GROUPS] ✅ ${inst.nome || inst.id}`);
            return { id: inst.id, nome: inst.nome || inst.id, ok: true };
          }
          lastErr = `${res.status}: ${(await res.text()).substring(0, 120)}`;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      console.log(`[DISABLE-GROUPS] ❌ ${inst.nome || inst.id}: ${lastErr}`);
      return { id: inst.id, nome: inst.nome || inst.id, ok: false, error: lastErr };
    });

    const details = await Promise.all(tasks);
    const success = details.filter(d => d.ok).length;
    const failed = details.length - success;

    return new Response(JSON.stringify({ ok: true, total: details.length, success, failed, details, blocked_groups: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
