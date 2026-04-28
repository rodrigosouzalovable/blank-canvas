import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendViaUazapi(serverUrl: string, instanceToken: string, telefone: string, mensagem: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [
    `${cleanUrl}/send/text`,
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
  ];

  let lastError = null;
  for (const url of endpoints) {
    console.log(`Tentando endpoint: ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    });
    const data = await response.json();
    console.log(`Resposta de ${url}:`, JSON.stringify(data));
    if (response.ok) return data;
    
    // If the endpoint responded with a real UAZAPI error (not 405 Method Not Allowed),
    // it means the endpoint is correct but the request itself failed (e.g. number not on WhatsApp)
    if (response.status !== 405) {
      const errMsg = data?.error || data?.message || 'Erro UAZAPI';
      throw new Error(errMsg);
    }
    
    lastError = data;
    console.log(`Endpoint ${url} falhou com status ${response.status}`);
  }
  const errorMsg = lastError?.message || lastError?.error || '';
  if (errorMsg.toLowerCase().includes('invalid token') || errorMsg.toLowerCase().includes('unauthorized')) {
    throw new Error('Token UAZAPI inválido. Verifique as credenciais da instância.');
  }
  throw new Error(errorMsg || 'Nenhum endpoint UAZAPI funcionou');
}

async function resolveInstanciaId(supabase: any, instanciaId: string | null, serverUrl: string | null, instanceToken: string | null): Promise<string | null> {
  if (instanciaId) return instanciaId;
  if (!serverUrl || !instanceToken) return null;
  
  const { data: inst } = await supabase
    .from('user_whatsapp_instances')
    .select('id')
    .eq('server_url', serverUrl)
    .eq('instance_token', instanceToken)
    .limit(1)
    .maybeSingle();
  
  return inst?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telefone, mensagem, uazapi_server_url, uazapi_instance_token, instancia_id } = await req.json();
    
    const tokenSuffix = uazapi_instance_token ? uazapi_instance_token.slice(-8) : 'global';
    console.log('Recebendo requisição para enviar WhatsApp:', { telefone, instance: tokenSuffix });

    if (!telefone) throw new Error('Telefone não informado');

    const telefoneFormatado = telefone.replace(/\D/g, '');
    const telefoneCompleto = telefoneFormatado.startsWith('55') 
      ? telefoneFormatado 
      : `55${telefoneFormatado}`;

    console.log('Telefone formatado:', telefoneCompleto);

    // Use provided credentials or fall back to global UAZAPI secrets
    const serverUrl = uazapi_server_url || Deno.env.get('UAZAPI_SERVER_URL');
    const instanceToken = uazapi_instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

    if (!serverUrl || !instanceToken) {
      throw new Error('Credenciais UAZAPI não configuradas');
    }

    const data = await sendViaUazapi(serverUrl, instanceToken, telefoneCompleto, mensagem);

    // --- INBOX: Salvar mensagem enviada no histórico ---
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const agora = new Date().toISOString();

      const resolvedId = await resolveInstanciaId(supabase, instancia_id, serverUrl, instanceToken);

      if (resolvedId) {
        // Find existing contact to use the correct phone format
        const suffix = telefoneCompleto.slice(-8);
        const { data: existingContact } = await supabase
          .from('whatsapp_contatos')
          .select('id, telefone')
          .eq('instancia_id', resolvedId)
          .like('telefone', `%${suffix}`)
          .maybeSingle();

        const telefoneParaSalvar = existingContact?.telefone || telefoneCompleto;

        // Extract WhatsApp message ID from UAZAPI response
        const whatsappMsgId = data?.key?.id || data?.id || data?.messageId || data?.message?.id || null;

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id: resolvedId,
          telefone_remoto: telefoneParaSalvar,
          conteudo: mensagem,
          direcao: 'saida',
          timestamp_msg: agora,
          lida: true,
          whatsapp_msg_id: whatsappMsgId,
        });

        if (existingContact) {
          await supabase.from('whatsapp_contatos').update({
            ultima_mensagem: mensagem.slice(0, 200),
            ultima_mensagem_em: agora,
          }).eq('id', existingContact.id);
        } else {
          await supabase.from('whatsapp_contatos').insert({
            instancia_id: resolvedId,
            telefone: telefoneCompleto,
            ultima_mensagem: mensagem.slice(0, 200),
            ultima_mensagem_em: agora,
            nao_lido: 0,
          });
        }

        console.log(`[INBOX] Mensagem de saída salva para ${telefoneCompleto}`);
      }
    } catch (inboxErr) {
      console.error('[INBOX] Erro ao salvar msg de saída:', inboxErr);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na função send-whatsapp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const isWhatsAppError = errorMessage.toLowerCase().includes('not on whatsapp') ||
      errorMessage.toLowerCase().includes('não está no whatsapp');
    return new Response(JSON.stringify({ success: false, error: errorMessage, fallback: isWhatsAppError }), {
      status: isWhatsAppError ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
