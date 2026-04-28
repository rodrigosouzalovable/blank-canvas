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
    console.log('Iniciando geração do relatório diário...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // === BUSCAR CONFIG DO RELATÓRIO ===
    const { data: config, error: configError } = await supabase
      .from('relatorio_diario_config')
      .select('instancia_id, telefone_destino, ativo')
      .limit(1)
      .maybeSingle();

    if (configError) throw configError;
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Relatório diário não configurado. Configure em Acionamento > Configurações WhatsApp.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!config.ativo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Relatório diário está desativado.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar credenciais da instância selecionada
    const { data: instancia, error: instError } = await supabase
      .from('user_whatsapp_instances')
      .select('server_url, instance_token, nome')
      .eq('id', config.instancia_id)
      .single();

    if (instError || !instancia) {
      throw new Error('Instância configurada para relatório não encontrada ou foi removida.');
    }

    const serverUrl = instancia.server_url;
    const instanceToken = instancia.instance_token;
    const telefoneDestino = config.telefone_destino;

    console.log('Usando instância:', instancia.nome || config.instancia_id);
    console.log('Telefone destino:', telefoneDestino);

    // Obter data de hoje no fuso de Brasília
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
    const hoje = brasiliaTime.toISOString().split('T')[0];

    console.log('Data do relatório:', hoje);

    // Buscar acordos lançados hoje
    const { data: acordosHoje, error: acordosError } = await supabase
      .from('acordos')
      .select('id, user_id')
      .gte('criado_em', `${hoje}T00:00:00-03:00`)
      .lte('criado_em', `${hoje}T23:59:59-03:00`);

    if (acordosError) throw acordosError;

    console.log('Acordos encontrados hoje:', acordosHoje?.length || 0);

    // Buscar todos os profiles para mapear user_id -> nome
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nome');

    const profileMap: Record<string, string> = {};
    if (profiles) {
      for (const profile of profiles) {
        profileMap[profile.id] = profile.nome;
      }
    }

    // Agrupar acordos por funcionário
    const acordosPorFuncionario: Record<string, number> = {};
    if (acordosHoje) {
      for (const acordo of acordosHoje) {
        const nome = profileMap[acordo.user_id] || 'Desconhecido';
        acordosPorFuncionario[nome] = (acordosPorFuncionario[nome] || 0) + 1;
      }
    }

    // Buscar parcelas pagas hoje
    const { data: pagamentosHoje, error: pagamentosError } = await supabase
      .from('pagamentos')
      .select('valor_parcela, acordo_id')
      .eq('data_paga', hoje)
      .eq('status', 'pago');

    if (pagamentosError) throw pagamentosError;

    console.log('Pagamentos encontrados hoje:', pagamentosHoje?.length || 0);

    // Buscar acordos dos pagamentos para obter user_id
    const acordoIds = pagamentosHoje?.map(p => p.acordo_id) || [];
    let acordosDosPagamentos: { id: string; user_id: string }[] = [];
    
    if (acordoIds.length > 0) {
      const { data: acordosData } = await supabase
        .from('acordos')
        .select('id, user_id')
        .in('id', acordoIds);
      acordosDosPagamentos = acordosData || [];
    }

    const acordoUserMap: Record<string, string> = {};
    for (const acordo of acordosDosPagamentos) {
      acordoUserMap[acordo.id] = acordo.user_id;
    }

    let totalGeral = 0;
    const valoresPorFuncionario: Record<string, number> = {};
    
    if (pagamentosHoje) {
      for (const pagamento of pagamentosHoje) {
        const userId = acordoUserMap[pagamento.acordo_id];
        const nome = userId ? (profileMap[userId] || 'Desconhecido') : 'Desconhecido';
        const valor = Number(pagamento.valor_parcela) || 0;
        valoresPorFuncionario[nome] = (valoresPorFuncionario[nome] || 0) + valor;
        totalGeral += valor;
      }
    }

    const dataFormatada = brasiliaTime.toLocaleDateString('pt-BR');

    let mensagem = `📊 *RELATÓRIO DIÁRIO - ${dataFormatada}*\n\n`;
    mensagem += `📝 *ACORDOS LANÇADOS HOJE:*\n`;
    const funcionariosAcordos = Object.entries(acordosPorFuncionario).sort((a, b) => b[1] - a[1]);
    
    if (funcionariosAcordos.length === 0) {
      mensagem += `• Nenhum acordo lançado hoje\n`;
    } else {
      for (const [nome, quantidade] of funcionariosAcordos) {
        const plural = quantidade === 1 ? 'acordo' : 'acordos';
        mensagem += `• ${nome}: ${quantidade} ${plural}\n`;
      }
    }

    mensagem += `\n💰 *PARCELAS PAGAS HOJE:*\n`;
    const funcionariosPagamentos = Object.entries(valoresPorFuncionario).sort((a, b) => b[1] - a[1]);
    
    if (funcionariosPagamentos.length === 0) {
      mensagem += `• Nenhuma parcela paga hoje\n`;
    } else {
      for (const [nome, valor] of funcionariosPagamentos) {
        const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        mensagem += `• ${nome}: ${valorFormatado}\n`;
      }
    }

    mensagem += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    const totalFormatado = totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    mensagem += `💵 *TOTAL RECEBIDO NO DIA: ${totalFormatado}*\n`;
    mensagem += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    console.log('Mensagem gerada:', mensagem);

    // === ENVIAR VIA UAZAPI ===
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const endpoints = [
      `${cleanUrl}/message/sendText`,
      `${cleanUrl}/sendText`,
      `${cleanUrl}/send/text`,
    ];

    console.log('Enviando relatório para:', telefoneDestino);

    let data: any;
    let sent = false;
    for (const url of endpoints) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({ number: telefoneDestino, text: mensagem }),
      });
      data = await response.json();
      console.log(`Resposta UAZAPI (${url}):`, data);
      if (response.ok) { sent = true; break; }
    }

    if (!sent) {
      throw new Error(data?.message || 'Erro ao enviar mensagem via UAZAPI');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Relatório enviado com sucesso',
        data: { acordosLancados: acordosPorFuncionario, parcelasPagas: valoresPorFuncionario, totalGeral }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao gerar/enviar relatório:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
