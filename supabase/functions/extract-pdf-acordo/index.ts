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
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      throw new Error('Nenhum PDF fornecido');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não está configurada');
    }

    console.log('Recebido PDF para extração de parcelas do acordo');

    const systemPrompt = `Você é um especialista em extrair dados de documentos de cálculo de débito e acordos de cobrança brasileiros.
Analise o PDF fornecido e extraia CADA PARCELA individualmente.

Para cada parcela, extraia:
- numero_parcela: número da parcela (1, 2, 3...)
- valor: valor da parcela em reais (número decimal, ex: 500.00)
- data_vencimento: data de vencimento no formato AAAA-MM-DD

Também extraia:
- valor_total: soma total de todas as parcelas

IMPORTANTE:
- Analise tabelas com parcelas, datas de vencimento e valores
- Cada linha da tabela de parcelas deve ser uma entrada separada
- Retorne valores numéricos sem formatação (sem R$, sem pontos de milhar, use ponto como separador decimal)
- Para datas, retorne no formato AAAA-MM-DD
- Se houver entrada/sinal separada das demais parcelas, inclua como parcela 1`;

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
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia todas as parcelas deste documento PDF de cálculo de débito/acordo:' },
              {
                type: 'image_url',
                image_url: {
                  url: pdfBase64.startsWith('data:') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_parcelas",
            description: "Extrai parcelas individuais do PDF de acordo",
            parameters: {
              type: "object",
              properties: {
                valor_total: { type: "number", description: "Valor total do acordo" },
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
      throw new Error('Não foi possível extrair dados do PDF');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Dados extraídos:', extractedData);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro na extração:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao processar PDF' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
