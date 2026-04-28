import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telefone, media_url, type, uazapi_server_url, uazapi_instance_token, instancia_id, file_name } = await req.json();

    if (!telefone) throw new Error('Telefone não informado');
    if (!media_url) throw new Error('URL da mídia não informada');
    if (!type || !['image', 'document'].includes(type)) throw new Error('Tipo inválido (use image ou document)');

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
    const body = { number: telefoneCompleto, type, file: media_url };

    console.log(`Enviando ${type} para ${telefoneCompleto} via ${endpoint}`);

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
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      const isDisconnected = (errMsg.toLowerCase().includes('disconnected') || errMsg.toLowerCase().includes('not connected') || response.status >= 500);
      if (isDisconnected) {
        return new Response(JSON.stringify({ success: false, error: errMsg, fallback: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(errMsg);
    }

    // Save to inbox
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
        const tipoConteudo = type === 'image' ? 'imagem' : 'documento';
        const emoji = type === 'image' ? '📷' : '📄';
        const descricao = `${emoji} ${type === 'image' ? 'Imagem enviada' : (file_name || 'Documento enviado')}`;

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id: resolvedInstanciaId,
          telefone_remoto: telefoneCompleto,
          conteudo: descricao,
          direcao: 'saida',
          timestamp_msg: agora,
          lida: true,
          tipo_conteudo: tipoConteudo,
          media_url: media_url,
        });

        // Upsert contact
        const { data: existingContact } = await supabase
          .from('whatsapp_contatos')
          .select('id')
          .eq('instancia_id', resolvedInstanciaId)
          .eq('telefone', telefoneCompleto)
          .maybeSingle();

        if (existingContact) {
          await supabase.from('whatsapp_contatos').update({
            ultima_mensagem: descricao,
            ultima_mensagem_em: agora,
          }).eq('id', existingContact.id);
        } else {
          await supabase.from('whatsapp_contatos').insert({
            instancia_id: resolvedInstanciaId,
            telefone: telefoneCompleto,
            ultima_mensagem: descricao,
            ultima_mensagem_em: agora,
            nao_lido: 0,
          });
        }

        console.log(`[INBOX] ${tipoConteudo} de saída salvo para ${telefoneCompleto}`);
      }
    } catch (inboxErr) {
      console.error('[INBOX] Erro ao salvar mídia no inbox:', inboxErr);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro send-whatsapp-media:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
