// Promoção automática de fase para instâncias em aquecimento.
// Roda 1x por dia (00:05 BRT). Incrementa dias_na_fase e promove a cada 7 dias.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIAS_POR_FASE = 7;
const FASE_MAX = 5;

// Limites diários por fase (alinhados com aquecimento-envio-autosave)
function limiteDiarioPorFase(fase: number): number {
  if (fase <= 2) return 3;
  if (fase <= 4) return 5;
  return 7;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: instancias, error } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("id, instancia_id, fase, dias_na_fase, status, fase_auto")
      .eq("status", "EM_AQUECIMENTO");

    if (error) throw error;
    if (!instancias?.length) {
      return json({ message: "Nenhuma instância em aquecimento", processadas: 0 });
    }

    let promovidas = 0;
    let aquecidas = 0;
    let incrementadas = 0;
    const notificacoes: any[] = [];

    for (const inst of instancias) {
      // Respeita configuração manual: se fase_auto = false, só incrementa contador
      const novoDias = (inst.dias_na_fase || 0) + 1;
      const podePromover = inst.fase_auto !== false;

      if (podePromover && novoDias >= DIAS_POR_FASE) {
        if ((inst.fase || 1) >= FASE_MAX) {
          // Já está na fase máxima → marca como AQUECIDO
          await supabase
            .from("whatsapp_aquecimento_instancias")
            .update({
              status: "AQUECIDO",
              dias_na_fase: 0,
              limite_diario: limiteDiarioPorFase(FASE_MAX),
              updated_at: new Date().toISOString(),
            })
            .eq("id", inst.id);
          aquecidas++;
          notificacoes.push({
            tipo: "aquecido",
            instancia_id: inst.instancia_id,
            mensagem: `Número totalmente aquecido (Fase ${FASE_MAX} concluída).`,
          });
        } else {
          const novaFase = (inst.fase || 1) + 1;
          await supabase
            .from("whatsapp_aquecimento_instancias")
            .update({
              fase: novaFase,
              dias_na_fase: 0,
              limite_diario: limiteDiarioPorFase(novaFase),
              updated_at: new Date().toISOString(),
            })
            .eq("id", inst.id);
          promovidas++;
          notificacoes.push({
            tipo: "promocao_fase",
            instancia_id: inst.instancia_id,
            mensagem: `Promovido para Fase ${novaFase} (limite ${limiteDiarioPorFase(novaFase)}/dia).`,
          });
        }
      } else {
        await supabase
          .from("whatsapp_aquecimento_instancias")
          .update({ dias_na_fase: novoDias, updated_at: new Date().toISOString() })
          .eq("id", inst.id);
        incrementadas++;
      }
    }

    if (notificacoes.length) {
      await supabase.from("aquecimento_notificacoes").insert(notificacoes);
    }

    console.log(
      `[PROMOCAO-FASE] Processadas=${instancias.length} Promovidas=${promovidas} Aquecidas=${aquecidas} Incrementadas=${incrementadas}`,
    );

    return json({
      success: true,
      processadas: instancias.length,
      promovidas,
      aquecidas,
      incrementadas,
    });
  } catch (err) {
    console.error("[PROMOCAO-FASE] Erro:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
