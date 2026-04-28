import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista sênior em estratégias de cobrança e recuperação de crédito no Brasil. Você tem vasta experiência em:

- Priorização de carteiras de inadimplentes
- Scripts e abordagens de negociação
- Técnicas de CPC (Contato com a Pessoa Certa)
- Segmentação por faixa de atraso, valor e perfil de pagamento
- Legislação brasileira de cobrança (CDC, LGPD)
- Indicadores de performance de cobrança (aging, hit rate, recovery rate)

Ao receber um pedido de estratégia, você deve:

1. **Análise da Situação**: Analise os dados da carteira fornecidos e identifique pontos críticos
2. **Priorização**: Sugira a ordem de prioridade para abordagem dos clientes
3. **Plano de Ação**: Crie um plano detalhado com etapas, prazos e responsáveis
4. **Scripts de Abordagem**: Forneça exemplos de scripts para telefone, WhatsApp ou e-mail
5. **Métricas de Acompanhamento**: Sugira KPIs para monitorar o sucesso da estratégia

Responda sempre em português brasileiro. Use formatação markdown com títulos, listas e tabelas quando apropriado. Seja prático e direto, com sugestões acionáveis.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, resumoCarteira } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userMessage = resumoCarteira
      ? `## Dados da Carteira\n${resumoCarteira}\n\n## Solicitação\n${prompt}`
      : prompt;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar estratégia" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("gerar-estrategia-cobranca error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
