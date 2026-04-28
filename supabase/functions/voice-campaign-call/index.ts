import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaign_id, contact_id, phone_number, server_url, instance_token } = await req.json();

    if (!phone_number) throw new Error('Telefone não informado');
    if (!server_url || !instance_token) throw new Error('Credenciais UAZAPI não configuradas');
    if (!contact_id) throw new Error('contact_id não informado');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const telefoneFormatado = phone_number.replace(/\D/g, '');
    const telefoneCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;
    const cleanUrl = server_url.replace(/\/+$/, '');

    console.log(`[VOICE-CALL] Initiating call to ${telefoneCompleto} via ${cleanUrl}`);

    // Update contact status to 'chamando'
    await supabase
      .from('voice_campaign_contacts')
      .update({ status: 'chamando', call_type: 'voice_call' })
      .eq('id', contact_id);

    // Try multiple possible UAZAPI call endpoints
    // NOTE: These endpoints are assumed. Verify against UAZAPI documentation.
    const endpoints = [
      { url: `${cleanUrl}/call/make`, body: { number: telefoneCompleto } },
      { url: `${cleanUrl}/call/start`, body: { number: telefoneCompleto } },
      { url: `${cleanUrl}/send/call`, body: { number: telefoneCompleto } },
    ];

    let lastError: any = null;
    let callId: string | null = null;

    for (const endpoint of endpoints) {
      console.log(`[VOICE-CALL] Trying endpoint: ${endpoint.url}`);
      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instance_token,
          },
          body: JSON.stringify(endpoint.body),
        });

        const responseText = await response.text();
        console.log(`[VOICE-CALL] Response from ${endpoint.url}: ${response.status} - ${responseText}`);

        let data: any;
        try { data = JSON.parse(responseText); } catch { data = { message: responseText }; }

        if (response.ok && !data?.error) {
          // Extract call_id from response (different field names possible)
          callId = data?.call_id || data?.callId || data?.id || data?.data?.id || null;
          
          // Store call_id and campaign_id for webhook matching
          await supabase
            .from('voice_campaign_contacts')
            .update({ 
              call_id: callId || `call_${Date.now()}`,
              status: 'chamando',
            })
            .eq('id', contact_id);

          console.log(`[VOICE-CALL] Call initiated successfully. call_id: ${callId}`);

          return new Response(JSON.stringify({ success: true, call_id: callId, data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        lastError = data;
      } catch (err) {
        lastError = err;
        console.log(`[VOICE-CALL] Endpoint ${endpoint.url} failed:`, err);
      }
    }

    // All endpoints failed
    const errorMsg = lastError?.message || lastError?.error || 'Nenhum endpoint de chamada UAZAPI funcionou';
    
    await supabase
      .from('voice_campaign_contacts')
      .update({ status: 'erro', erro_mensagem: errorMsg })
      .eq('id', contact_id);

    throw new Error(errorMsg);
  } catch (error) {
    console.error('[VOICE-CALL] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
