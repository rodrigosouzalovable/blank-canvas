// Backfill: percorre o histórico de aquecimento e salva cada par de instâncias
// na agenda física uma da outra (com cache + delay anti-ban).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";
import { salvarContatoAgendaCacheado, nomeAmigavelInstancia } from "../_shared/agenda-contatos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limite: number = Math.min(Math.max(Number(body.limite) || 200, 10), 1000);

    // Carrega todas as instâncias ativas
    const { data: insts, error: errI } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token, ativo")
      .eq("ativo", true);
    if (errI) throw errI;
    if (!insts?.length) return json({ message: "Sem instâncias ativas", processados: 0 });

    const instMap = new Map(insts.map((i: any) => [i.id, i]));

    // Quais pares já foram salvos? Evita reprocessar.
    const { data: jaSalvos } = await supabase
      .from("whatsapp_contatos_agenda_salvos")
      .select("instancia_id, numero_destino");
    const cache = new Set((jaSalvos || []).map((s: any) => `${s.instancia_id}|${s.numero_destino}`));

    let processados = 0;
    let salvos = 0;
    let pulos = 0;
    let erros = 0;

    // Gera todos os pares ordenados (A,B) entre instâncias ativas, limitado
    outer: for (let i = 0; i < insts.length; i++) {
      for (let j = 0; j < insts.length; j++) {
        if (i === j) continue;
        if (processados >= limite) break outer;

        const a: any = insts[i];
        const b: any = insts[j];
        const phoneB = b.nome?.match(/^\d+/)?.[0];
        if (!phoneB) continue;
        const numeroB = phoneB.startsWith("55") ? phoneB : `55${phoneB}`;

        const cacheKey = `${a.id}|${numeroB}`;
        if (cache.has(cacheKey)) { pulos++; continue; }

        try {
          const nomeB = nomeAmigavelInstancia(b.nome, phoneB);
          const r = await salvarContatoAgendaCacheado(supabase, a.id, a.server_url, a.instance_token, numeroB, nomeB);
          processados++;
          if (r.salvo) salvos++;
          else if (r.cached) pulos++;
          else erros++;

          // Delay anti-ban 800-2000ms
          await new Promise((res) => setTimeout(res, 800 + Math.random() * 1200));
        } catch (_) { erros++; }
      }
    }

    return json({ success: true, processados, salvos, pulos, erros, instancias: insts.length });
  } catch (err) {
    console.error("[SYNC-AGENDA]", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
