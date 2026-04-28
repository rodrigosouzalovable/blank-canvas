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
    const { telefone, texto, choices, footerText, uazapi_server_url, uazapi_instance_token, instancia_id } = await req.json();

    if (!telefone) throw new Error('Telefone não informado');
    if (!texto) throw new Error('Texto não informado');
    if (!choices || !Array.isArray(choices) || choices.length === 0) throw new Error('Botões não configurados');
    if (choices.length > 3) throw new Error('Máximo de 3 botões permitidos');

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
    const endpoint = `${cleanUrl}/send/menu`;
    const body = {
      number: telefoneCompleto,
      type: 'button',
      text: texto,
      choices,
      footerText: footerText || 'Escolha uma opção',
    };

    console.log(`Enviando botões para ${telefoneCompleto} via ${endpoint}`);

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
      throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    }

    // --- INBOX: Save outgoing button message ---
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
        const buttonLabels = choices.map((c: string) => c.split('|')[0]).join(', ');
        const resumo = `📋 ${texto.substring(0, 80)}... [Botões: ${buttonLabels}]`;

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id: resolvedInstanciaId,
          telefone_remoto: telefoneParaSalvar,
          conteudo: resumo,
          direcao: 'saida',
          timestamp_msg: agora,
          lida: true,
          tipo_conteudo: 'texto',
        });

        if (existingContact) {
          await supabase.from('whatsapp_contatos').update({
            ultima_mensagem: resumo.substring(0, 200),
            ultima_mensagem_em: agora,
          }).eq('id', existingContact.id);
        } else {
          await supabase.from('whatsapp_contatos').insert({
            instancia_id: resolvedInstanciaId,
            telefone: telefoneCompleto,
            ultima_mensagem: resumo.substring(0, 200),
            ultima_mensagem_em: agora,
            nao_lido: 0,
          });
        }

        console.log(`[INBOX] Botões de saída salvos para ${telefoneCompleto}`);
      }
    } catch (inboxErr) {
      console.error('[INBOX] Erro ao salvar botões no inbox:', inboxErr);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro send-whatsapp-buttons:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
