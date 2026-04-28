import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSystemPrompt(conversasContext: string) {
  const hoje = new Date();
  const dataHoje = hoje.toLocaleDateString('pt-BR');
  const limite7 = new Date(hoje);
  limite7.setDate(limite7.getDate() + 7);
  const dataLimite7 = limite7.toLocaleDateString('pt-BR');

  return `Você é um assistente de treinamento e operação para um chatbot de cobrança. O administrador pode te ensinar regras OU pedir para executar ações reais como enviar mensagens para clientes via WhatsApp.

CONTEXTO TEMPORAL:
- A data de hoje é: ${dataHoje}
- Daqui a 7 dias será: ${dataLimite7}

${conversasContext ? `CONVERSAS ATIVAS NO SISTEMA:\n${conversasContext}\n` : ''}

CAPACIDADES:
1. **ENSINAR REGRAS** - O admin te ensina como responder clientes (gatilho + resposta)
2. **ENVIAR MENSAGENS** - O admin pede para enviar uma mensagem real para um cliente via WhatsApp
3. **VISÃO** - Você pode analisar imagens/screenshots

FLUXO PARA ENSINAR REGRAS (action: "save"):
- O admin diz algo como "quando o cliente perguntar sobre boleto, responda X"
- Você extrai GATILHO e RESPOSTA
- Confirma com o admin
- Se confirmado, responda EXATAMENTE neste formato JSON:
  {"action":"save","gatilho":"[gatilho]","resposta":"[resposta]","message":"Regra salva! ✅"}

FLUXO PARA ENVIAR MENSAGEM (action: "send"):
- O admin menciona um número de telefone e pede para enviar algo (ex: "volta na conversa com +556493097974 e passe a proposta")
- Você busca o contexto da conversa nas CONVERSAS ATIVAS acima
- Monte a mensagem usando os dados financeiros reais (valor_avista, valor_parcelado, parcelas, etc)
- SEMPRE mostre a mensagem que vai enviar e peça confirmação ANTES
- Quando o admin confirmar (sim, pode, manda, envia, etc), responda EXATAMENTE neste formato JSON:
  {"action":"send","telefone":"[numero completo com 55]","mensagem":"[texto exato a enviar]","message":"✅ Mensagem enviada!"}

REGRAS IMPORTANTES:
- Seja simpático e conversacional
- Use emojis moderadamente
- NUNCA invente dados financeiros — use APENAS os valores das CONVERSAS ATIVAS
- Se não encontrar a conversa do telefone pedido, diga que não encontrou
- O JSON deve ser a resposta COMPLETA quando for executar ação (não misture texto + JSON)
- Quando o admin pedir para "passar a proposta" ou "enviar proposta", monte a mensagem de negociação com os valores reais
- Se o admin fizer saudação ou pergunta genérica, responda normalmente
- SEMPRE confirme com o admin antes de enviar (nunca envie direto na primeira mensagem)
- Ao montar propostas, use o formato que o chatbot usa: valor à vista e opção parcelada`;
}

async function fetchConversasContext(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('chatbot_conversas')
      .select('telefone, etapa, dados')
      .neq('etapa', 'finalizado')
      .order('atualizado_em', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) return '';

    return data.map((c: any) => {
      const d = c.dados || {};
      const nome = d.nome || d.primeiro_nome || 'Desconhecido';
      const parts = [`- Tel: ${c.telefone}, Nome: ${nome}, Etapa: ${c.etapa}`];
      if (d.valor_avista) parts.push(`  Valor à vista: R$ ${Number(d.valor_avista).toFixed(2)}`);
      if (d.valor_parcelado) parts.push(`  Valor parcelado: R$ ${Number(d.valor_parcelado).toFixed(2)}`);
      if (d.parcelas) parts.push(`  Parcelas: ${d.parcelas}x`);
      if (d.valor_parcela) parts.push(`  Valor parcela: R$ ${Number(d.valor_parcela).toFixed(2)}`);
      if (d.valor_divida) parts.push(`  Dívida original: R$ ${Number(d.valor_divida).toFixed(2)}`);
      if (d.cpf) parts.push(`  CPF: ${d.cpf}`);
      return parts.join('\n');
    }).join('\n');
  } catch (e) {
    console.error('Error fetching conversas context:', e);
    return '';
  }
}

async function sendViaUazapi(serverUrl: string, instanceToken: string, telefone: string, mensagem: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
    `${cleanUrl}/send/text`,
  ];

  let lastError = null;
  for (const url of endpoints) {
    console.log(`[teach-chatbot] Tentando endpoint: ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    });
    const data = await response.json();
    if (response.ok) return data;
    lastError = data;
  }
  throw new Error(lastError?.message || lastError?.error || 'Nenhum endpoint UAZAPI funcionou');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch real conversation context for the AI
    const conversasContext = await fetchConversasContext(supabase);

    const aiMessages = [
      { role: 'system', content: buildSystemPrompt(conversasContext) },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      }))
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: aiMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ reply: 'Muitas requisições. Aguarde alguns segundos e tente novamente.', regra_criada: false }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ reply: 'Créditos de IA insuficientes. Adicione créditos no workspace.', regra_criada: false }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar. Tente novamente.';

    let regraCriada = false;
    let mensagemEnviada = false;
    let finalReply = reply;

    try {
      let jsonStr = reply;
      const jsonMatch = reply.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      
      const parsed = JSON.parse(jsonStr);

      // ACTION: SAVE RULE
      if (parsed.action === 'save' && parsed.gatilho && parsed.resposta) {
        const { error } = await supabase
          .from('chatbot_regras')
          .insert({ gatilho: parsed.gatilho, resposta: parsed.resposta });

        if (error) {
          console.error('Error saving rule:', error);
          finalReply = 'Ops, tive um problema ao salvar a regra. Pode tentar novamente? 😅';
        } else {
          regraCriada = true;
          finalReply = parsed.message || 'Regra salva com sucesso! ✅';
        }
      }

      // ACTION: SEND MESSAGE
      if (parsed.action === 'send' && parsed.telefone && parsed.mensagem) {
        const telNorm = parsed.telefone.replace(/\D/g, '');
        const telComplete = telNorm.startsWith('55') ? telNorm : `55${telNorm}`;

        // Find the conversation to get instance_token and server_url
        const { data: conv } = await supabase
          .from('chatbot_conversas')
          .select('instance_token, server_url, telefone, dados')
          .or(`telefone.eq.${telComplete},telefone.eq.${telNorm}`)
          .order('atualizado_em', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conv) {
          finalReply = `❌ Não encontrei conversa ativa para o telefone ${parsed.telefone}. Verifique o número.`;
        } else {
          const serverUrl = conv.server_url || Deno.env.get('UAZAPI_SERVER_URL');
          const instanceToken = conv.instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

          if (!serverUrl || !instanceToken) {
            finalReply = '❌ Credenciais WhatsApp não encontradas para esta conversa.';
          } else {
            try {
              await sendViaUazapi(serverUrl, instanceToken, conv.telefone, parsed.mensagem);
              mensagemEnviada = true;
              finalReply = parsed.message || `✅ Mensagem enviada para ${conv.telefone}!`;

              // Update conversation stage if it was waiting
              const dados = conv.dados || {};
              if (dados.etapa === 'aguardando_admin' || dados.silencioso) {
                await supabase
                  .from('chatbot_conversas')
                  .update({ 
                    etapa: 'proposta_enviada',
                    dados: { ...dados, silencioso: false },
                    atualizado_em: new Date().toISOString()
                  })
                  .eq('telefone', conv.telefone);
              }
            } catch (sendErr) {
              console.error('Error sending WhatsApp:', sendErr);
              finalReply = `❌ Erro ao enviar mensagem: ${sendErr instanceof Error ? sendErr.message : 'erro desconhecido'}`;
            }
          }
        }
      }
    } catch {
      // Not JSON, normal text response
    }

    return new Response(
      JSON.stringify({ reply: finalReply, regra_criada: regraCriada, mensagem_enviada: mensagemEnviada }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in teach-chatbot:', error);
    return new Response(
      JSON.stringify({ reply: 'Erro interno. Tente novamente.', regra_criada: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
