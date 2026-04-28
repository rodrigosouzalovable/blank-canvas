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
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
    `${cleanUrl}/send/text`,
  ];
  let lastError = null;
  for (const url of endpoints) {
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
    console.log('Processando fila de WhatsApp...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const agora = new Date();
    const horaAtualUTC = agora.getUTCHours();
    const horaAtualBrasilia = (horaAtualUTC - 3 + 24) % 24;

    // Block Sundays (day 0 in Brasilia timezone)
    const diaBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
    if (diaBrasilia === 0) {
      console.log('Domingo em Brasília, pulando envio...');
      return new Response(JSON.stringify({ success: true, message: 'Domingo - sem envio', enviado: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (horaAtualBrasilia < 8 || horaAtualBrasilia >= 18) {
      console.log(`Fora do horário comercial (${horaAtualBrasilia}h Brasília), pulando...`);
      return new Response(JSON.stringify({ success: true, message: 'Fora do horário comercial', enviado: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: mensagensPendentes, error: buscaError } = await supabase
      .from('whatsapp_fila')
      .select('*')
      .eq('status', 'pendente')
      .lte('agendado_para', agora.toISOString())
      .order('agendado_para', { ascending: true })
      .limit(1);

    if (buscaError) throw buscaError;

    if (!mensagensPendentes || mensagensPendentes.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma mensagem pendente', enviado: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const mensagem = mensagensPendentes[0];
    console.log(`Processando mensagem ${mensagem.id} para ${mensagem.telefone}...`);

    try {
      // Use per-message credentials if available, fallback to global
      const serverUrl = mensagem.server_url || Deno.env.get('UAZAPI_SERVER_URL');
      const instanceToken = mensagem.instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

      if (!serverUrl || !instanceToken) throw new Error('Credenciais UAZAPI não configuradas');

      console.log(`Usando instância: ${serverUrl} (${mensagem.server_url ? 'per-user' : 'global'})`);

      await sendViaUazapi(serverUrl, instanceToken, mensagem.telefone, mensagem.mensagem);

      await supabase.from('whatsapp_fila').update({ status: 'enviado', enviado_em: new Date().toISOString() }).eq('id', mensagem.id);
      await supabase.from('whatsapp_lembretes_log').insert({ pagamento_id: mensagem.pagamento_id, tipo_lembrete: mensagem.tipo_lembrete, sucesso: true });

      // --- INBOX: Save to inbox ---
      try {
        let instanciaId: string | null = null;
        const { data: inst } = await supabase
          .from('user_whatsapp_instances')
          .select('id')
          .eq('server_url', serverUrl)
          .eq('instance_token', instanceToken)
          .limit(1)
          .maybeSingle();
        if (inst) instanciaId = inst.id;

        if (instanciaId) {
          const agoraStr = new Date().toISOString();

          // Find existing contact to use correct phone format
          const suffix = mensagem.telefone.slice(-8);
          const { data: existingContact } = await supabase
            .from('whatsapp_contatos')
            .select('id, telefone')
            .eq('instancia_id', instanciaId)
            .like('telefone', `%${suffix}`)
            .maybeSingle();

          const telefoneParaSalvar = existingContact?.telefone || mensagem.telefone;

          await supabase.from('whatsapp_mensagens').insert({
            instancia_id: instanciaId,
            telefone_remoto: telefoneParaSalvar,
            conteudo: mensagem.mensagem,
            direcao: 'saida',
            timestamp_msg: agoraStr,
            lida: true,
          });

          if (existingContact) {
            await supabase.from('whatsapp_contatos').update({
              ultima_mensagem: mensagem.mensagem.slice(0, 200),
              ultima_mensagem_em: agoraStr,
            }).eq('id', existingContact.id);
          } else {
            await supabase.from('whatsapp_contatos').insert({
              instancia_id: instanciaId,
              telefone: mensagem.telefone,
              ultima_mensagem: mensagem.mensagem.slice(0, 200),
              ultima_mensagem_em: agoraStr,
              nao_lido: 0,
            });
          }
          console.log(`[INBOX] Mensagem da fila salva para ${mensagem.telefone}`);
        }
      } catch (inboxErr) {
        console.error('[INBOX] Erro ao salvar msg da fila no inbox:', inboxErr);
      }

      console.log(`Mensagem ${mensagem.id} enviada com sucesso!`);
      return new Response(JSON.stringify({ success: true, enviado: true, mensagem_id: mensagem.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (sendError) {
      console.error(`Erro ao enviar mensagem ${mensagem.id}:`, sendError);
      const erroMsg = sendError instanceof Error ? sendError.message : 'Erro desconhecido';
      await supabase.from('whatsapp_fila').update({ status: 'erro', erro_mensagem: erroMsg }).eq('id', mensagem.id);
      await supabase.from('whatsapp_lembretes_log').insert({ pagamento_id: mensagem.pagamento_id, tipo_lembrete: mensagem.tipo_lembrete, sucesso: false, erro_mensagem: erroMsg });
      return new Response(JSON.stringify({ success: false, error: erroMsg, mensagem_id: mensagem.id }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Erro na função process-whatsapp-queue:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
