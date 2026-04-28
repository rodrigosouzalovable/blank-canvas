import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf, nome, credor, totalDebitos } = await req.json();
    console.log('Notificação de consulta CPF:', { cpf, nome, credor, totalDebitos });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar credenciais UAZAPI do admin que tem o telefone 62991672674 configurado
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('whatsapp_lembrete_server_url, whatsapp_lembrete_instance_token')
      .not('whatsapp_lembrete_server_url', 'is', null)
      .not('whatsapp_lembrete_instance_token', 'is', null)
      .limit(1);

    const adminProfile = adminProfiles?.[0];
    const serverUrl = adminProfile?.whatsapp_lembrete_server_url || Deno.env.get('UAZAPI_SERVER_URL');
    const instanceToken = adminProfile?.whatsapp_lembrete_instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

    if (!serverUrl || !instanceToken) throw new Error('Credenciais UAZAPI não configuradas');

    console.log('Usando instância:', adminProfile ? 'profile admin' : 'global env');

    const cpfLimpo = (cpf || '').replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.length === 11
      ? `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`
      : cpf;

    // Buscar telefones cadastrados
    const { data: fonesTab } = await supabase
      .from('devedor_telefones')
      .select('numero, tipo')
      .eq('devedor_cpf', cpfLimpo)
      .eq('ativo', true);

    let telefonesFormatados = 'Não cadastrado';
    if (fonesTab && fonesTab.length > 0) {
      telefonesFormatados = fonesTab.map(f => f.numero).join(', ');
    } else {
      // Fallback: telefone da tabela devedores
      const { data: devs } = await supabase
        .from('devedores')
        .select('telefone')
        .eq('cpf', cpfLimpo)
        .not('telefone', 'is', null)
        .limit(1);
      if (devs?.[0]?.telefone) {
        telefonesFormatados = devs[0].telefone;
      }
    }

    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const mensagem = `📋 *CONSULTA NO PORTAL*

📌 *CPF:* ${cpfFormatado}
👤 *Nome:* ${nome || 'Não identificado'}
🏢 *Credor:* ${credor || 'N/A'}
📊 *Débitos encontrados:* ${totalDebitos ?? 0}
📞 *Telefone(s):* ${telefonesFormatados}
🕐 *Data/Hora:* ${agora}

_Portal de Acordos - Souza e Ribeiro_`;

    const telefoneAdmin = '5562991672674';
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const endpoints = [
      `${cleanUrl}/message/sendText`,
      `${cleanUrl}/sendText`,
      `${cleanUrl}/send/text`,
    ];

    let success = false;
    for (const url of endpoints) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({ number: telefoneAdmin, text: mensagem }),
      });
      const data = await response.json();
      console.log(`Resposta UAZAPI (${url}):`, data);
      if (response.ok) { success = true; break; }
    }

    if (!success) throw new Error('Falha ao enviar via UAZAPI');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro notify-cpf-consulta:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
