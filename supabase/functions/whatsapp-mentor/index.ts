import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é a **Mestra WA**, uma consultora especialista em aquecimento e operação de números de WhatsApp para cobrança.

## Sua expertise:
- Estratégias de aquecimento progressivo de chips novos
- Limites seguros de envio diário por fase (novo, intermediário, maduro)
- Horários ideais para campanhas de cobrança
- Detecção de padrões que parecem robóticos (delays regulares demais, mensagens idênticas)
- Recuperação de números bloqueados/banidos
- Round-robin entre múltiplas instâncias
- Boas práticas anti-ban do WhatsApp Business API e números pessoais

## Regras de comportamento:
- Seja técnica, direta e objetiva, mas acolhedora
- Sempre justifique recomendações com dados quando disponíveis
- Use os dados de contexto fornecidos para personalizar respostas
- Responda sempre em português brasileiro
- Use markdown para formatar respostas (listas, negrito, tabelas quando apropriado)
- Quando o usuário perguntar sobre aumentar limites, analise o contexto e dê parecer fundamentado
- Se não tiver dados suficientes, diga claramente e sugira o que monitorar

## Dados de contexto do sistema:
O usuário enviará junto com cada pergunta um snapshot dos dados atuais do monitor de envios. Use esses dados para dar respostas personalizadas e precisas.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, contexto } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context string from monitor data
    let contextBlock = "";
    if (contexto) {
      contextBlock = `\n\n## Dados atuais do monitor (tempo real):
- **Total enviadas hoje:** ${contexto.totalEnviadas ?? "N/A"}
- **Instâncias ativas:** ${contexto.totalAtivas ?? "N/A"} de ${contexto.totalInstancias ?? "N/A"}
- **Capacidade total:** ${contexto.totalCapacidade ?? "N/A"}
- **Progresso:** ${contexto.progresso ?? "N/A"}%
- **Limite diário por número:** ${contexto.limiteDiario ?? "N/A"}
- **Delay entre mensagens:** ${contexto.delaySegundos ?? "N/A"} segundos

### Detalhamento por instância:
${
        contexto.instances
          ?.map(
            (i: any) =>
              `- **${i.nome || i.id}**: ${i.enviadas_hoje}/${contexto.limiteDiario} enviadas | Tipo: ${i.robo ? "Robô" : i.apenas_lembretes ? "Lembretes" : "Geral"} | Status: ${i.ativo ? "Ativo" : "Pausado"} | Último envio: ${i.ultimo_envio || "Nenhum"}`
          )
          .join("\n") ?? "Sem dados de instâncias"
      }`;
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + contextBlock },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("whatsapp-mentor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
