// Diagnostica o estado atual do webhook configurado em cada instância UAZAPI ativa.
// Retorna URL, eventos, filtros e status, para o Monitor de Envios mostrar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const expectedWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;

    const { data: instances, error } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token")
      .eq("ativo", true)
      .limit(500);

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    if (!instances || instances.length === 0) {
      return json({ ok: true, expectedWebhookUrl, total: 0, details: [] });
    }

    const tasks = instances.map(async (inst) => {
      const base = inst.server_url.replace(/\/+$/, "");
      const token = inst.instance_token;

      // UAZAPI exposes webhook config via GET /webhook with token header
      const attempts = [
        { url: `${base}/webhook`, headers: { token } },
        { url: `${base}/webhook/${token}`, headers: {} as Record<string, string> },
      ];

      let lastErr = "";
      for (const a of attempts) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12000);
          const res = await fetch(a.url, { method: "GET", headers: a.headers, signal: ctrl.signal });
          clearTimeout(t);
          const text = await res.text();
          if (!res.ok) {
            lastErr = `${res.status}: ${text.substring(0, 120)}`;
            continue;
          }
          let data: any = null;
          try { data = JSON.parse(text); } catch { data = { raw: text }; }

          // Try multiple shapes (UAZAPI returns array or object depending on version)
          const wh = Array.isArray(data) ? data[0] : (data?.webhook || data);
          const url = wh?.url || wh?.webhookUrl || wh?.URL || null;
          const events: string[] = wh?.events || wh?.subscribe || [];
          const excludeGroupMessages = wh?.excludeGroupMessages ?? wh?.excludeGroups ?? null;
          const excludeBroadcast = wh?.excludeBroadcast ?? null;
          const excludeMessages = wh?.excludeMessages || [];

          const urlMatchesExpected = typeof url === "string" && url === expectedWebhookUrl;
          const hasMessagesEvent = Array.isArray(events) && events.some((e) => String(e).toLowerCase() === "messages");
          const groupsBlocked = excludeGroupMessages === true;
          const broadcastBlocked = excludeBroadcast === true;
          const ownEchoBlocked = Array.isArray(excludeMessages) && excludeMessages.some((m: string) => String(m).toLowerCase() === "wassentbyapi");

          // "Healthy" only requires the URL to match AND the messages event to be active.
          // Exclusion flags are reported as warnings (not failures) because several UAZAPI
          // server versions do NOT return excludeGroupMessages/excludeBroadcast in GET /webhook
          // even when those filters are correctly applied.
          const healthy = urlMatchesExpected && hasMessagesEvent;
          const issues: string[] = [];
          if (!url) issues.push("Sem URL configurada");
          else if (!urlMatchesExpected) issues.push(`URL incorreta (${url})`);
          if (!hasMessagesEvent) issues.push("Evento 'messages' ausente — RESPOSTAS NÃO CHEGAM");
          if (!groupsBlocked) issues.push("Aviso: flag 'excludeGroupMessages' não retornada pelo servidor (filtro pode estar ativo mesmo assim)");
          if (!broadcastBlocked) issues.push("Aviso: flag 'excludeBroadcast' não retornada pelo servidor (filtro pode estar ativo mesmo assim)");
          if (!ownEchoBlocked) issues.push("Aviso: eco de envios próprios pode não estar bloqueado");

          return {
            id: inst.id,
            nome: inst.nome || inst.id.slice(0, 8),
            ok: true,
            healthy,
            url,
            events,
            excludeGroupMessages,
            excludeBroadcast,
            excludeMessages,
            issues,
          };
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      return {
        id: inst.id,
        nome: inst.nome || inst.id.slice(0, 8),
        ok: false,
        healthy: false,
        error: lastErr || "Falha ao consultar webhook",
        issues: ["Não foi possível ler a configuração do webhook"],
      };
    });

    const details = await Promise.all(tasks);
    const healthyCount = details.filter((d: any) => d.healthy).length;
    const brokenCount = details.length - healthyCount;

    return json({
      ok: true,
      expectedWebhookUrl,
      total: details.length,
      healthy: healthyCount,
      broken: brokenCount,
      details,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
