import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FALLBACK_PATTERNS = [
  'not on whatsapp',
  'failed to send usync query',
  'info query timed out',
  'error verifying whatsapp number',
  'timeout',
];

function normalizeErrorMessage(data: any, status?: number) {
  return data?.message || data?.error || (status ? `HTTP ${status}` : 'Erro desconhecido');
}

function shouldReturnSoftError(message: string, status?: number) {
  const normalized = message.toLowerCase();
  return status === 400 || status === 404 || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
    || FALLBACK_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function buildSoftErrorResponse(message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    fallback: true,
    ...extra,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telefone, audio_url, uazapi_server_url, uazapi_instance_token, instancia_id } = await req.json();

    if (!telefone) throw new Error('Telefone não informado');
    if (!audio_url) throw new Error('URL do áudio não informada');

    const serverUrl = uazapi_server_url || Deno.env.get('UAZAPI_SERVER_URL');
    const instanceToken = uazapi_instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

    if (!serverUrl || !instanceToken) {
      throw new Error('Credenciais UAZAPI não configuradas');
    }

    const telefoneFormatado = telefone.replace(/\D/g, '');
    const telefoneCompleto = telefoneFormatado.startsWith('55')
      ? telefoneFormatado
      : `55${telefoneFormatado}`;

    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const endpoint = `${cleanUrl}/send/media`;
    const body = { number: telefoneCompleto, type: 'ptt', file: audio_url };

    console.log(`Enviando áudio para ${telefoneCompleto} via ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instanceToken },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let data: any;
    try { data = JSON.parse(rawText); } catch { data = { message: rawText }; }

    console.log(`Resposta (${response.status}):`, JSON.stringify(data));

    if (!response.ok) {
      const errorMessage = normalizeErrorMessage(data, response.status);
      if (shouldReturnSoftError(errorMessage, response.status)) {
        console.warn(`Falha externa tratada em send-whatsapp-audio: ${errorMessage}`);
        return buildSoftErrorResponse(errorMessage, { status: response.status });
      }

      throw new Error(errorMessage);
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let resolvedInstanciaId = instancia_id;

      if (!resolvedInstanciaId && serverUrl && instanceToken) {
        const { data: inst } = await supabase
          .from('user_whatsapp_instances')
          .select('id')
          .eq('server_url', serverUrl)
          .eq('instance_token', instanceToken)
          .limit(1)
          .maybeSingle();
        if (inst) resolvedInstanciaId = inst.id;
      }

      if (resolvedInstanciaId) {
        const agora = new Date().toISOString();
        const suffix = telefoneCompleto.slice(-8);
        const { data: existingContact } = await supabase
          .from('whatsapp_contatos')
          .select('id, telefone')
          .eq('instancia_id', resolvedInstanciaId)
          .like('telefone', `%${suffix}`)
          .maybeSingle();

        const telefoneParaSalvar = existingContact?.telefone || telefoneCompleto;

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id: resolvedInstanciaId,
          telefone_remoto: telefoneParaSalvar,
          conteudo: '🎵 Áudio enviado',
          direcao: 'saida',
          timestamp_msg: agora,
          lida: true,
          tipo_conteudo: 'audio',
          media_url: audio_url,
        });

        if (existingContact) {
          await supabase.from('whatsapp_contatos').update({
            ultima_mensagem: '🎵 Áudio enviado',
            ultima_mensagem_em: agora,
          }).eq('id', existingContact.id);
        } else {
          await supabase.from('whatsapp_contatos').insert({
            instancia_id: resolvedInstanciaId,
            telefone: telefoneCompleto,
            ultima_mensagem: '🎵 Áudio enviado',
            ultima_mensagem_em: agora,
            nao_lido: 0,
          });
        }

        console.log(`[INBOX] Áudio de saída salvo para ${telefoneCompleto}`);
      }
    } catch (inboxErr) {
      console.error('[INBOX] Erro ao salvar áudio no inbox:', inboxErr);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro send-whatsapp-audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    if (shouldReturnSoftError(errorMessage)) {
      console.warn(`Erro tratado sem 500 em send-whatsapp-audio: ${errorMessage}`);
      return buildSoftErrorResponse(errorMessage);
    }

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
