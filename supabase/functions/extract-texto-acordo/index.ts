import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texto } = await req.json();

    if (!texto || !texto.trim()) {
      throw new Error('Nenhum texto fornecido');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não está configurada');
    }

    console.log('Recebido texto para extração de parcelas:', texto);

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `Você é um especialista em interpretar descrições de acordos de cobrança brasileiros.
O usuário vai descrever um acordo feito com um cliente, e você deve extrair as parcelas.

Data de hoje: ${today}

Para cada parcela, extraia:
- numero_parcela: número sequencial (1, 2, 3...)
- valor: valor da parcela em reais (número decimal, ex: 1665.99)
- data_vencimento: data de vencimento no formato AAAA-MM-DD

REGRAS IMPORTANTES:
- Se o usuário mencionar "entrada" ou "paga hoje", use a data de hoje (${today}) como vencimento da primeira parcela
- Se mencionar "todo dia X de cada mês", calcule as datas sequenciais a partir do próximo mês
- Se mencionar dia da semana (ex: "quarta-feira, dia 4 de março"), converta para a data correta
- Se o valor for igual para todas as parcelas restantes, repita o valor para cada uma
- Interprete valores em formato brasileiro (1.665,99 = 1665.99)
- Retorne valores numéricos sem formatação
- Para datas, retorne no formato AAAA-MM-DD
- Se houver entrada separada das demais parcelas, inclua como parcela 1
- Se o texto mencionar um número total de parcelas, gere exatamente esse número
- Se não mencionar número de parcelas mas der informações suficientes para deduzir, calcule`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extraia as parcelas deste acordo descrito pelo operador:\n\n"${texto}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_parcelas",
            description: "Extrai parcelas do texto descritivo do acordo",
            parameters: {
              type: "object",
              properties: {
                valor_total: { type: "number", description: "Valor total do acordo (soma de todas as parcelas)" },
                parcelas: {
                  type: "array",
                  description: "Lista de parcelas extraídas",
                  items: {
                    type: "object",
                    properties: {
                      numero_parcela: { type: "number", description: "Número da parcela" },
                      valor: { type: "number", description: "Valor da parcela" },
                      data_vencimento: { type: "string", description: "Data de vencimento AAAA-MM-DD" },
                    },
                    required: ["numero_parcela", "valor", "data_vencimento"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["valor_total", "parcelas"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_parcelas" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro no AI Gateway:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Taxa de requisições excedida. Tente novamente.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Erro no gateway de IA: ${response.status}`);
    }

    const result = await response.json();
    console.log('Resposta da IA:', JSON.stringify(result, null, 2));

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_parcelas') {
      throw new Error('Não foi possível interpretar o acordo descrito');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Dados extraídos do texto:', extractedData);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro na extração:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao processar texto' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
