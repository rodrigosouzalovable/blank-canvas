import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensagem_id } = await req.json();
    if (!mensagem_id) {
      return new Response(JSON.stringify({ error: 'mensagem_id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the message with its WhatsApp ID and instance info
    const { data: msg, error: msgError } = await supabase
      .from('whatsapp_mensagens')
      .select('id, whatsapp_msg_id, instancia_id, telefone_remoto')
      .eq('id', mensagem_id)
      .maybeSingle();

    if (msgError || !msg) {
      return new Response(JSON.stringify({ error: 'Mensagem não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let deletedOnWhatsApp = false;

    if (msg.whatsapp_msg_id && msg.instancia_id) {
      // Get instance credentials
      const { data: inst } = await supabase
        .from('user_whatsapp_instances')
        .select('server_url, instance_token')
        .eq('id', msg.instancia_id)
        .maybeSingle();

      if (inst) {
        const cleanUrl = inst.server_url.replace(/\/+$/, '');
        const endpoints = [
          { url: `${cleanUrl}/message/delete`, body: { id: msg.whatsapp_msg_id, fromMe: true } },
          { url: `${cleanUrl}/chat/deleteMessage`, body: { id: msg.whatsapp_msg_id, fromMe: true } },
          { url: `${cleanUrl}/message/delete?token=${inst.instance_token}`, body: { id: msg.whatsapp_msg_id, fromMe: true }, noHeader: true },
        ];

        for (const ep of endpoints) {
          try {
            console.log(`[delete-msg] Trying: ${ep.url}`);
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (!ep.noHeader) headers['token'] = inst.instance_token;

            const res = await fetch(ep.url, {
              method: 'POST',
              headers,
              body: JSON.stringify(ep.body),
            });
            const text = await res.text();
            console.log(`[delete-msg] Response: ${res.status} ${text.substring(0, 200)}`);

            if (res.ok) {
              deletedOnWhatsApp = true;
              break;
            }
          } catch (e) {
            console.error(`[delete-msg] Error with ${ep.url}:`, e.message);
          }
        }
      }
    }

    // Always delete from local DB
    await supabase.from('whatsapp_mensagens').delete().eq('id', mensagem_id);

    return new Response(JSON.stringify({ 
      success: true, 
      deleted_on_whatsapp: deletedOnWhatsApp,
      had_whatsapp_id: !!msg.whatsapp_msg_id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[delete-msg] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
