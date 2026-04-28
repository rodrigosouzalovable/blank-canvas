import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      throw new Error('Nenhuma imagem fornecida');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não está configurada');
    }

    console.log('Recebida imagem para extração de dados do acordo');

    const systemPrompt = `Você é um especialista em extrair dados de imagens de sistemas de cobrança brasileiros.
Analise a imagem fornecida com atenção e extraia as seguintes informações:

1. Nome do cliente - geralmente está em destaque, em letras maiúsculas
2. CPF - formato XXX.XXX.XXX-XX ou apenas números
3. Telefone - pegue o PRIMEIRO número de telefone encontrado, formato (XX) XXXXX-XXXX ou similar
4. Valor total do acordo - procure por "Valor:", "Total:", "Valor do Acordo:" seguido de R$
5. Número de parcelas - procure por "Parcelamento:", "Parcelas:" ou formato "Xx R$"
6. Valor de cada parcela - extraia do parcelamento (ex: 7x R$ 122,60 = parcela de 122.60)
7. Data do primeiro pagamento - formato DD/MM/AAAA, procure por "Data:", "1ª Parcela:", "Vencimento:"
8. Dias em atraso - procure por "Atraso:", "Dias em atraso:", geralmente é um número

Se algum campo não for encontrado claramente, retorne null para esse campo.
Retorne os valores numéricos sem formatação (sem R$, sem pontos de milhar).
Para datas, mantenha o formato DD/MM/AAAA.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia os dados do acordo desta imagem de sistema de cobrança:',
              },
              {
                type: 'image_url',
                image_url: {
                  url: image,
                },
              },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_acordo_data",
            description: "Extrai dados estruturados do acordo da imagem",
            parameters: {
              type: "object",
              properties: {
                cliente_nome: { 
                  type: "string",
                  description: "Nome completo do cliente em letras maiúsculas"
                },
                cliente_cpf: { 
                  type: "string",
                  description: "CPF do cliente no formato XXX.XXX.XXX-XX"
                },
                cliente_telefone: { 
                  type: "string",
                  description: "Primeiro telefone encontrado no formato (XX) XXXXX-XXXX"
                },
                valor_total: { 
                  type: "number",
                  description: "Valor total do acordo em reais (ex: 858.20)"
                },
                parcelas: { 
                  type: "number",
                  description: "Número de parcelas do acordo"
                },
                valor_parcela: { 
                  type: "number",
                  description: "Valor de cada parcela em reais (ex: 122.60)"
                },
                data_primeiro_pagamento: { 
                  type: "string",
                  description: "Data do primeiro pagamento no formato DD/MM/AAAA"
                },
                dias_atraso: { 
                  type: "number",
                  description: "Número de dias em atraso"
                }
              },
              required: ["cliente_nome", "cliente_cpf", "valor_total", "parcelas", "valor_parcela", "data_primeiro_pagamento", "dias_atraso"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_acordo_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro no AI Gateway:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Taxa de requisições excedida. Tente novamente em alguns segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes. Por favor, adicione créditos à sua conta.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Erro no gateway de IA: ${response.status}`);
    }

    const result = await response.json();
    console.log('Resposta da IA:', JSON.stringify(result, null, 2));

    // Extrair dados do tool call
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_acordo_data') {
      throw new Error('Não foi possível extrair dados da imagem');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Dados extraídos:', extractedData);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: extractedData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na extração:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao processar imagem';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
