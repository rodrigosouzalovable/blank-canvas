import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: capitalize first letter, lowercase rest
function capitalizeName(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Helper: paginated fetch to bypass 1000-row limit
async function fetchAll(supabase: any, table: string, query: (q: any) => any) {
  const allData: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const q = supabase.from(table).select;
    let built = query(supabase.from(table));
    built = built.range(from, from + pageSize - 1);
    const { data, error } = await built;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando verificação de lembretes de pagamento (batch)...');

    let overrideToken: string | null = null;
    let overrideServerUrl: string | null = null;
    let filterUserId: string | null = null;
    try {
      const body = await req.json();
      if (body?.instance_token) overrideToken = body.instance_token;
      if (body?.server_url) overrideServerUrl = body.server_url;
      if (body?.user_id) filterUserId = body.user_id;
    } catch { /* no body */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (filterUserId) {
      console.log(`Filtrando por user_id: ${filterUserId}`);
    }

    // Use Brasilia timezone (UTC-3) for "today" calculation
    const agoraBrasilia = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    const hojeStr = agoraBrasilia.toISOString().split('T')[0];
    const hoje = new Date(hojeStr + 'T00:00:00Z');
    
    const tresDias = new Date(hoje);
    tresDias.setDate(tresDias.getDate() + 3);
    const tresDiasStr = tresDias.toISOString().split('T')[0];

    // Query 1: Parcelas de hoje e 3 dias
    const parcelasProximas = await fetchAll(supabase, 'pagamentos', (q: any) => {
      let query = q.select(`id, numero_parcela, data_prevista, valor_parcela, acordo_id,
        acordos!inner ( id, user_id, cliente_nome, cliente_telefone, status )`)
        .eq('status', 'pendente')
        .in('data_prevista', [hojeStr, tresDiasStr]);
      if (filterUserId) query = query.eq('acordos.user_id', filterUserId);
      return query;
    });

    // Query 2: TODAS as parcelas vencidas (antes de hoje)
    const parcelasVencidas = await fetchAll(supabase, 'pagamentos', (q: any) => {
      let query = q.select(`id, numero_parcela, data_prevista, valor_parcela, acordo_id,
        acordos!inner ( id, user_id, cliente_nome, cliente_telefone, status )`)
        .eq('status', 'pendente')
        .lt('data_prevista', hojeStr);
      if (filterUserId) query = query.eq('acordos.user_id', filterUserId);
      return query;
    });

    // Combinar todas as parcelas com seus tipos
    const todasParcelas: Array<{ parcela: any; tipoLembrete: string }> = [];

    for (const p of parcelasProximas) {
      const tipo = p.data_prevista === hojeStr ? 'dia_vencimento' : '3_dias';
      todasParcelas.push({ parcela: p, tipoLembrete: tipo });
    }
    for (const p of parcelasVencidas) {
      const dtVenc = new Date(p.data_prevista + 'T12:00:00');
      const diffMs = hoje.getTime() - dtVenc.getTime();
      const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      todasParcelas.push({ parcela: p, tipoLembrete: `vencido_d${diasAtraso}` });
    }

    // In automatic mode (no overrideToken), restrict to D-3, D0, D+1, D+2 only
    const AUTOMATIC_ALLOWED_TYPES = ['3_dias', 'dia_vencimento', 'vencido_d1', 'vencido_d2'];
    const parcelasFiltradas = overrideToken
      ? todasParcelas
      : todasParcelas.filter(p => AUTOMATIC_ALLOWED_TYPES.includes(p.tipoLembrete));

    console.log(`Total: ${todasParcelas.length} parcelas (${parcelasProximas.length} próximas + ${parcelasVencidas.length} vencidas), Filtradas para envio: ${parcelasFiltradas.length}`);

    if (parcelasFiltradas.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: 'Nenhuma parcela para notificar', agendados: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- BATCH: Collect unique user_ids and pagamento_ids ---
    const userIdSet = new Set<string>();
    const pagamentoIdSet = new Set<string>();
    for (const { parcela } of parcelasFiltradas) {
      const acordo = parcela.acordos as any;
      if (acordo.status === 'ativo' && acordo.cliente_telefone) {
        userIdSet.add(acordo.user_id);
        pagamentoIdSet.add(parcela.id);
      }
    }
    const userIds = [...userIdSet];
    const pagamentoIds = [...pagamentoIdSet];

    console.log(`Usuários únicos: ${userIds.length}, Pagamentos elegíveis: ${pagamentoIds.length}`);

    if (pagamentoIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: 'Nenhuma parcela elegível', agendados: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- BATCH: Fetch all profiles at once ---
    const profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      // Paginate in chunks of 500 for .in()
      for (let i = 0; i < userIds.length; i += 500) {
        const chunk = userIds.slice(i, i + 500);
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, nome, whatsapp_lembretes_habilitado, whatsapp_lembrete_server_url, whatsapp_lembrete_instance_token')
          .in('id', chunk);
        if (error) { console.error('Erro profiles batch:', error); throw error; }
        for (const p of (profiles || [])) profilesMap.set(p.id, p);
      }
    }

    // --- BATCH: Fetch all whatsapp instances (apenas_lembretes) at once ---
    const instancesMap = new Map<string, any>();
    if (!overrideToken && userIds.length > 0) {
      for (let i = 0; i < userIds.length; i += 500) {
        const chunk = userIds.slice(i, i + 500);
        const { data: instances, error } = await supabase
          .from('user_whatsapp_instances')
          .select('user_id, server_url, instance_token')
          .in('user_id', chunk)
          .eq('apenas_lembretes', true)
          .eq('ativo', true);
        if (error) { console.error('Erro instances batch:', error); throw error; }
        for (const inst of (instances || [])) {
          // Keep first match per user
          if (!instancesMap.has(inst.user_id)) instancesMap.set(inst.user_id, inst);
        }
      }
    }

    // --- BATCH: Fetch custom message templates per user ---
    const userTemplatesMap = new Map<string, Map<string, string[]>>();
    if (userIds.length > 0) {
      for (let i = 0; i < userIds.length; i += 500) {
        const chunk = userIds.slice(i, i + 500);
        const { data: tplRows, error } = await supabase
          .from('lembrete_mensagens_templates')
          .select('user_id, tipo_lembrete, mensagem, ativo, ordem')
          .in('user_id', chunk)
          .eq('ativo', true)
          .order('ordem', { ascending: true });
        if (error) { console.error('Erro templates batch:', error); }
        for (const r of (tplRows || [])) {
          if (!userTemplatesMap.has(r.user_id)) userTemplatesMap.set(r.user_id, new Map());
          const userMap = userTemplatesMap.get(r.user_id)!;
          if (!userMap.has(r.tipo_lembrete)) userMap.set(r.tipo_lembrete, []);
          userMap.get(r.tipo_lembrete)!.push(r.mensagem);
        }
      }
    }
    console.log(`Templates customizados: ${userTemplatesMap.size} usuários`);

    const filaSet = new Set<string>();
    for (let i = 0; i < pagamentoIds.length; i += 100) {
      const chunk = pagamentoIds.slice(i, i + 100);
      let filaQuery = supabase
        .from('whatsapp_fila')
        .select('pagamento_id, tipo_lembrete')
        .in('pagamento_id', chunk);
      // When override token, only check for duplicates with the same instance
      if (overrideToken) {
        filaQuery = filaQuery.eq('instance_token', overrideToken);
      }
      const { data: filaRows, error } = await filaQuery;
      if (error) { console.error('Erro fila batch:', error); throw error; }
      for (const r of (filaRows || [])) filaSet.add(`${r.pagamento_id}_${r.tipo_lembrete}`);
    }

    // --- BATCH: Fetch existing log entries for dedup ---
    const logSet = new Set<string>();
    for (let i = 0; i < pagamentoIds.length; i += 100) {
      const chunk = pagamentoIds.slice(i, i + 100);
      const { data: logRows, error } = await supabase
        .from('whatsapp_lembretes_log')
        .select('pagamento_id, tipo_lembrete')
        .in('pagamento_id', chunk);
      if (error) { console.error('Erro log batch:', error); throw error; }
      for (const r of (logRows || [])) logSet.add(`${r.pagamento_id}_${r.tipo_lembrete}`);
    }

    console.log(`Dedup: ${filaSet.size} na fila, ${logSet.size} no log`);

    // --- Calcular horário base para agendamento ---
    const agora = new Date();
    const horaAtualUTC = agora.getUTCHours();
    const horaAtualBrasilia = (horaAtualUTC - 3 + 24) % 24;
    
    let proximoHorario: Date;
    if (horaAtualBrasilia >= 18 || horaAtualBrasilia < 8) {
      proximoHorario = new Date(agora);
      if (horaAtualBrasilia >= 18) {
        proximoHorario.setUTCDate(proximoHorario.getUTCDate() + 1);
      }
      proximoHorario.setUTCHours(11, 0, 0, 0);
    } else {
      proximoHorario = new Date(agora);
    }

    // --- Build set of configured days per user (from templates) ---
    // For users with custom templates, only send for days they have configured
    const userConfiguredDaysMap = new Map<string, Set<string>>();
    for (const [userId, tplMap] of userTemplatesMap.entries()) {
      userConfiguredDaysMap.set(userId, new Set(tplMap.keys()));
    }

    // --- Build batch insert array in memory ---
    let agendados = 0;
    let pulados = 0;
    const insertBatch: any[] = [];

    for (const { parcela, tipoLembrete } of parcelasFiltradas) {
      const acordo = parcela.acordos as any;
      
      if (acordo.status !== 'ativo') { pulados++; continue; }
      if (!acordo.cliente_telefone) { pulados++; continue; }

      // If user has configured templates, only send for those specific days (skip for manual override)
      if (!overrideToken) {
        const configuredDays = userConfiguredDaysMap.get(acordo.user_id);
        if (configuredDays && !configuredDays.has(tipoLembrete)) { pulados++; continue; }
      }

      const profile = profilesMap.get(acordo.user_id);
      // Skip whatsapp_lembretes_habilitado check when using override token (manual send from dialog)
      if (!overrideToken) {
        if (!profile || !profile.whatsapp_lembretes_habilitado) { pulados++; continue; }
      }

      // Dedup check in memory (skip fila check for override token since we want fresh queue)
      const dedupKey = `${parcela.id}_${tipoLembrete}`;
      if (overrideToken) {
        // Only skip if already in fila with same token (avoid duplicates within same manual session)
        if (filaSet.has(dedupKey)) { pulados++; continue; }
      } else {
        if (filaSet.has(dedupKey) || logSet.has(dedupKey)) { pulados++; continue; }
      }

      // Resolve credentials
      let finalServerUrl: string | null;
      let finalInstanceToken: string | null;

      if (overrideToken && overrideServerUrl) {
        finalServerUrl = overrideServerUrl;
        finalInstanceToken = overrideToken;
      } else {
        const inst = instancesMap.get(acordo.user_id);
        if (!inst) { pulados++; continue; }
        finalServerUrl = inst.server_url;
        finalInstanceToken = inst.instance_token;
      }

      const valorFormatado = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL'
      }).format(parcela.valor_parcela);

      const dataVencimento = new Date(parcela.data_prevista + 'T12:00:00');
      const dataFormatada = dataVencimento.toLocaleDateString('pt-BR');
      const primeiroNome = capitalizeName((profile?.nome || 'Operador').split(' ')[0]);
      const nomeCliente = acordo.cliente_nome.split(' ').map((w: string) => capitalizeName(w)).join(' ');
      const primeiroNomeCliente = capitalizeName(acordo.cliente_nome.split(' ')[0]);

      // Calculate dias_atraso for variable substitution
      const diasAtrasoNum = tipoLembrete.startsWith('vencido_d') ? tipoLembrete.replace('vencido_d', '') : '0';

      // Check for custom template
      const userTpls = userTemplatesMap.get(acordo.user_id);
      const customMsgs = userTpls?.get(tipoLembrete);

      let mensagem: string;
      if (customMsgs && customMsgs.length > 0) {
        // Pick random from available custom templates
        const tpl = customMsgs[Math.floor(Math.random() * customMsgs.length)];
        mensagem = tpl
           .replace(/\{nome_cliente\}/g, nomeCliente)
           .replace(/\{primeiro_nome\}/g, primeiroNomeCliente)
           .replace(/\{nome_operador\}/g, primeiroNome)
           .replace(/\{valor\}/g, valorFormatado)
           .replace(/\{data_vencimento\}/g, dataFormatada)
           .replace(/\{dias_atraso\}/g, diasAtrasoNum);
      } else if (tipoLembrete === 'vencido_d1') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Sua parcela no valor de ${valorFormatado} venceu ontem (${dataFormatada}). Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else if (tipoLembrete === 'vencido_d2') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Notamos que a parcela no valor de ${valorFormatado} com vencimento em ${dataFormatada} ainda consta em aberto. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza. Caso contrário, consegue regularizar hoje?`;
      } else if (tipoLembrete === 'vencido_d10') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Identificamos que sua parcela no valor de ${valorFormatado}, vencida em ${dataFormatada}, continua em aberto há 10 dias. É muito importante manter o acordo em dia. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else if (tipoLembrete === 'vencido_d11') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Reforçamos que sua parcela de ${valorFormatado} (vencimento ${dataFormatada}) segue pendente há 11 dias. Por favor, regularize o quanto antes para evitar problemas com seu acordo. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else if (tipoLembrete === 'vencido_d20') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Sua parcela de ${valorFormatado} está em atraso há 20 dias (vencimento ${dataFormatada}). Pedimos que regularize a situação o mais breve possível para evitar o descumprimento do acordo. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else if (tipoLembrete === 'vencido_d30') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Este é o último aviso referente à parcela de ${valorFormatado} vencida em ${dataFormatada}, em atraso há 30 dias. Caso o pagamento não seja regularizado, o acordo poderá ser considerado descumprido. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else if (tipoLembrete === 'dia_vencimento') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo e estou passando para lembrar que o vencimento da sua parcela no valor de ${valorFormatado} vence HOJE. Gostaria que enviasse o boleto para pagamento?`;
      } else if (tipoLembrete === '3_dias') {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo e estou passando para lembrar que o vencimento da sua parcela no valor de ${valorFormatado} é dia ${dataFormatada}. Gostaria que enviasse o boleto para pagamento?`;
      } else if (tipoLembrete.startsWith('vencido_d')) {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo. Sua parcela no valor de ${valorFormatado} com vencimento em ${dataFormatada} encontra-se em atraso há ${diasAtrasoNum} dias. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
      } else {
        mensagem = `Olá ${primeiroNomeCliente}, aqui é ${primeiroNome}, do departamento de acordos das Lojas Novo Mundo e estou passando para lembrar que o vencimento da sua parcela no valor de ${valorFormatado} é dia ${dataFormatada}. Gostaria que enviasse o boleto para pagamento?`;
      }

      const telefoneFormatado = acordo.cliente_telefone.replace(/\D/g, '');
      const telefoneCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;

      // Check scheduling hour and Sunday block
      const horaAgendadaUTC = proximoHorario.getUTCHours();
      const horaAgendadaBrasilia = (horaAgendadaUTC - 3 + 24) % 24;
      if (horaAgendadaBrasilia >= 18) {
        proximoHorario.setUTCDate(proximoHorario.getUTCDate() + 1);
        proximoHorario.setUTCHours(11, 0, 0, 0);
      }
      // If scheduled for Sunday (BRT), advance to Monday 08:00 BRT (11:00 UTC)
      const diaBrasilia = new Date(proximoHorario.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
      if (diaBrasilia === 0) {
        proximoHorario.setUTCDate(proximoHorario.getUTCDate() + 1);
        proximoHorario.setUTCHours(11, 0, 0, 0);
      }

      insertBatch.push({
        pagamento_id: parcela.id,
        tipo_lembrete: tipoLembrete,
        telefone: telefoneCompleto,
        mensagem,
        agendado_para: proximoHorario.toISOString(),
        status: 'pendente',
        server_url: finalServerUrl,
        instance_token: finalInstanceToken,
        cliente_nome: acordo.cliente_nome,
      });

      // Add to dedup set to avoid duplicates within this run
      filaSet.add(dedupKey);

      agendados++;

      const intervaloMs = (Math.floor(Math.random() * 11) + 5) * 60 * 1000;
      proximoHorario = new Date(proximoHorario.getTime() + intervaloMs);
    }

    // --- BATCH INSERT ---
    if (insertBatch.length > 0) {
      // Insert in chunks of 500
      for (let i = 0; i < insertBatch.length; i += 500) {
        const chunk = insertBatch.slice(i, i + 500);
        const { error: insertError } = await supabase.from('whatsapp_fila').insert(chunk);
        if (insertError) {
          console.error(`Erro ao inserir batch ${i}-${i + chunk.length}:`, insertError);
        } else {
          console.log(`Batch ${i}-${i + chunk.length} inserido com sucesso`);
        }
      }
    }

    console.log(`Concluído: ${agendados} agendados, ${pulados} pulados`);

    return new Response(JSON.stringify({ 
      success: true, agendados, pulados, total: parcelasFiltradas.length
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Erro na função check-payment-reminders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
