import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    console.log('[Aquecimento Report] Iniciando relatório diário de aquecimento...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // === BUSCAR CONFIG DO RELATÓRIO (mesma tabela do relatório diário) ===
    const { data: config, error: configError } = await supabase
      .from('relatorio_diario_config')
      .select('instancia_id, telefone_destino, ativo')
      .limit(1)
      .maybeSingle();

    if (configError) throw configError;
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Relatório não configurado. Configure em Acionamento > Configurações WhatsApp.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!config.ativo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Relatório diário está desativado.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar credenciais da instância
    const { data: instancia, error: instError } = await supabase
      .from('user_whatsapp_instances')
      .select('server_url, instance_token, nome')
      .eq('id', config.instancia_id)
      .single();

    if (instError || !instancia) {
      throw new Error('Instância configurada para relatório não encontrada.');
    }

    const serverUrl = instancia.server_url;
    const instanceToken = instancia.instance_token;
    const telefoneDestino = config.telefone_destino;

    // Data de hoje em Brasília
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
    const hoje = brasiliaTime.toISOString().split('T')[0];
    const hojeStart = `${hoje}T00:00:00-03:00`;
    const hojeEnd = `${hoje}T23:59:59-03:00`;
    const dataFormatada = brasiliaTime.toLocaleDateString('pt-BR');

    console.log('[Aquecimento Report] Data:', hoje);

    // === BUSCAR INSTÂNCIAS DE AQUECIMENTO ===
    const { data: aquecInstancias } = await supabase
      .from('whatsapp_aquecimento_instancias')
      .select('instancia_id, fase, dias_na_fase, interacoes_hoje, interacoes_total, status, limite_diario, respostas_recebidas, ultima_interacao, ultimo_aviso_falha');

    // Buscar nomes das instâncias
    const instanciaIds = (aquecInstancias || []).map(i => i.instancia_id);
    let instanciaNames: Record<string, string> = {};
    if (instanciaIds.length > 0) {
      const { data: insts } = await supabase
        .from('user_whatsapp_instances')
        .select('id, nome')
        .in('id', instanciaIds);
      if (insts) {
        for (const inst of insts) {
          instanciaNames[inst.id] = inst.nome || inst.id.substring(0, 8);
        }
      }
    }

    const totalInstancias = aquecInstancias?.length || 0;
    const ativas = (aquecInstancias || []).filter(i => i.status === 'ativo');
    const pausadas = (aquecInstancias || []).filter(i => i.status === 'pausado');

    // === STATUS POSTADOS HOJE ===
    const { data: statusHoje, error: statusErr } = await supabase
      .from('whatsapp_aquecimento_status_log')
      .select('instancia_id, resultado')
      .gte('postado_em', hojeStart)
      .lte('postado_em', hojeEnd);

    const totalStatusPostados = (statusHoje || []).filter(s => s.resultado === 'ENVIADO').length;
    const totalStatusFalha = (statusHoje || []).filter(s => s.resultado !== 'ENVIADO').length;

    // Instâncias que postaram status hoje
    const instanciasComStatus = new Set((statusHoje || []).filter(s => s.resultado === 'ENVIADO').map(s => s.instancia_id));

    // === INTERAÇÕES HOJE (mensagens trocadas) ===
    const { data: interacoesHoje } = await supabase
      .from('whatsapp_aquecimento_interacoes')
      .select('id, status')
      .gte('created_at', hojeStart)
      .lte('created_at', hojeEnd);

    const totalInteracoes = interacoesHoje?.length || 0;
    const interacoesEnviadas = (interacoesHoje || []).filter(i => i.status === 'enviado' || i.status === 'respondido').length;

    // === CONTATOS SALVOS HOJE (check notificações) ===
    const { data: notifContatos } = await supabase
      .from('aquecimento_notificacoes')
      .select('id')
      .eq('tipo', 'contato_salvo')
      .gte('criado_em', hojeStart)
      .lte('criado_em', hojeEnd);

    const contatosSalvos = notifContatos?.length || 0;

    // === AGRUPAR POR FASE ===
    const porFase: Record<number, number> = {};
    for (const inst of (aquecInstancias || [])) {
      porFase[inst.fase] = (porFase[inst.fase] || 0) + 1;
    }

    const faseLabels: Record<number, string> = {
      1: 'Fase 1 (Iniciante)',
      2: 'Fase 2 (Básico)',
      3: 'Fase 3 (Intermediário)',
      4: 'Fase 4 (Avançado)',
      5: 'Fase 5 (Aquecido)',
    };

    // === ALERTAS ===
    const alertas: string[] = [];

    // Instâncias pausadas
    for (const inst of pausadas) {
      const nome = instanciaNames[inst.instancia_id] || inst.instancia_id.substring(0, 8);
      alertas.push(`⏸️ "${nome}" pausado`);
    }

    // Instâncias ativas que não postaram status hoje
    for (const inst of ativas) {
      if (!instanciasComStatus.has(inst.instancia_id)) {
        const nome = instanciaNames[inst.instancia_id] || inst.instancia_id.substring(0, 8);
        alertas.push(`📭 "${nome}" não postou status hoje`);
      }
    }

    // Instâncias com aviso de falha recente
    for (const inst of (aquecInstancias || [])) {
      if (inst.ultimo_aviso_falha) {
        const avisoDate = new Date(inst.ultimo_aviso_falha);
        const hojeDate = new Date(hojeStart);
        if (avisoDate >= hojeDate) {
          const nome = instanciaNames[inst.instancia_id] || inst.instancia_id.substring(0, 8);
          alertas.push(`⚠️ "${nome}" teve falhas hoje`);
        }
      }
    }

    // === MONTAR MENSAGEM ===
    const percentStatus = totalInstancias > 0 ? Math.round((instanciasComStatus.size / ativas.length) * 100) : 0;

    let mensagem = `📱 *RELATÓRIO DE AQUECIMENTO - ${dataFormatada}*\n\n`;

    mensagem += `📊 *RESUMO GERAL*\n`;
    mensagem += `• ${totalInstancias} números cadastrados\n`;
    mensagem += `• ${ativas.length} ativos | ${pausadas.length} pausados\n`;
    mensagem += `• ${totalStatusPostados} status postados hoje (${percentStatus}%)\n`;
    mensagem += `• ${totalInteracoes} interações entre números\n`;
    mensagem += `• ${contatosSalvos} contatos salvos hoje\n`;

    mensagem += `\n🔥 *POR FASE:*\n`;
    for (let fase = 5; fase >= 1; fase--) {
      const count = porFase[fase] || 0;
      if (count > 0) {
        mensagem += `• ${faseLabels[fase] || `Fase ${fase}`}: ${count} número${count > 1 ? 's' : ''}\n`;
      }
    }

    if (alertas.length > 0) {
      mensagem += `\n⚠️ *ALERTAS (${alertas.length}):*\n`;
      for (const alerta of alertas.slice(0, 10)) {
        mensagem += `• ${alerta}\n`;
      }
      if (alertas.length > 10) {
        mensagem += `• ... e mais ${alertas.length - 10} alertas\n`;
      }
    } else {
      mensagem += `\n✅ *Nenhum alerta — tudo funcionando normalmente*\n`;
    }

    mensagem += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    mensagem += `🤖 Sistema 100% autônomo`;

    console.log('[Aquecimento Report] Mensagem gerada, enviando...');

    // === ENVIAR VIA UAZAPI ===
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const endpoints = [
      `${cleanUrl}/send/text`,
      `${cleanUrl}/message/sendText`,
      `${cleanUrl}/sendText`,
    ];

    let data: any;
    let sent = false;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceToken },
          body: JSON.stringify({ number: telefoneDestino, text: mensagem }),
        });
        data = await response.json();
        console.log(`[Aquecimento Report] Resposta UAZAPI (${url}):`, JSON.stringify(data).substring(0, 200));
        if (response.ok) { sent = true; break; }
      } catch (e) {
        console.error(`[Aquecimento Report] Falha no endpoint ${url}:`, e);
      }
    }

    if (!sent) {
      throw new Error(data?.message || 'Erro ao enviar mensagem via UAZAPI');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Relatório de aquecimento enviado com sucesso',
        data: { totalInstancias, ativas: ativas.length, statusPostados: totalStatusPostados, alertas: alertas.length }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Aquecimento Report] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
