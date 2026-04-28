import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_MSGS_PER_INSTANCE_PER_DAY = 80;

interface ClienteData {
  cpf: string;
  nome: string;
  telefone: string;
  atraso: string;
  saldo: number;
}

const formatPrimeiroNome = (nome: string): string => {
  const primeiro = nome.trim().split(/\s+/)[0].toLowerCase();
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const calcAvista = (saldo: number): string => formatCurrency(saldo * 0.5);

const calcParcelado = (saldo: number): string => {
  const valorComDesconto = saldo * 0.7;
  const opcoes: string[] = [];
  for (let i = 2; i <= 24; i++) {
    const valorParcela = valorComDesconto / i;
    if (valorParcela >= 100) {
      opcoes.push(`- ${i}x de ${formatCurrency(valorParcela)}`);
    }
  }
  return opcoes.join('\n');
};

const replaceVariables = (template: string, cliente: ClienteData): string =>
  template
    .replace(/\{nome\}/g, cliente.nome)
    .replace(/\{primeiro_nome\}/g, formatPrimeiroNome(cliente.nome))
    .replace(/\{cpf\}/g, cliente.cpf)
    .replace(/\{atraso\}/g, String(cliente.atraso))
    .replace(/\{saldo\}/g, formatCurrency(cliente.saldo))
    .replace(/\{avista\}/g, calcAvista(cliente.saldo))
    .replace(/\{parcelado\}/g, calcParcelado(cliente.saldo));

async function sendViaUazapi(serverUrl: string, instanceToken: string, telefone: string, mensagem: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [
    `${cleanUrl}/send/text`,
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
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

// Find contact by suffix matching (last 8 digits)
async function findContactBySuffix(supabase: any, instanciaId: string, telefone: string) {
  const suffix = telefone.replace(/\D/g, '').slice(-8);
  const { data: contatos } = await supabase
    .from('whatsapp_contatos')
    .select('id, telefone')
    .eq('instancia_id', instanciaId)
    .like('telefone', `%${suffix}`);
  return contatos?.[0] || null;
}

// Save message to inbox with contact upsert
async function saveToInbox(supabase: any, instanciaId: string, telefoneOriginal: string, msg: string) {
  const cleanPhone = telefoneOriginal.replace(/\D/g, '');
  const phoneFull = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  // Find existing contact by suffix
  const existingContact = await findContactBySuffix(supabase, instanciaId, phoneFull);
  const phoneToUse = existingContact?.telefone || phoneFull;

  // Upsert contact
  if (existingContact) {
    await supabase
      .from('whatsapp_contatos')
      .update({
        ultima_mensagem: msg.substring(0, 200),
        ultima_mensagem_em: new Date().toISOString(),
      })
      .eq('id', existingContact.id);
  } else {
    await supabase.from('whatsapp_contatos').upsert({
      instancia_id: instanciaId,
      telefone: phoneToUse,
      nome: phoneToUse,
      ultima_mensagem: msg.substring(0, 200),
      ultima_mensagem_em: new Date().toISOString(),
      nao_lido: 0,
    }, { onConflict: 'instancia_id,telefone' });
  }

  // Save message
  await supabase.from('whatsapp_mensagens').insert({
    instancia_id: instanciaId,
    telefone_remoto: phoneToUse,
    conteudo: msg,
    direcao: 'saida',
    timestamp_msg: new Date().toISOString(),
    lida: true,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: agendamentos, error: fetchErr } = await supabase
      .from('acionamento_agendamentos')
      .select('*')
      .eq('status', 'pendente')
      .lte('agendado_para', new Date().toISOString())
      .limit(1);

    if (fetchErr) throw fetchErr;
    if (!agendamentos || agendamentos.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum agendamento pendente' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agendamento = agendamentos[0];
    const { id, user_id, historico_data, min_sec, max_sec } = agendamento;

    await supabase
      .from('acionamento_agendamentos')
      .update({ status: 'executando' })
      .eq('id', id);

    const { clientes, mensagens } = historico_data as { clientes: ClienteData[]; mensagens: string[] };

    const { data: instancesData } = await supabase
      .from('user_whatsapp_instances')
      .select('id, server_url, instance_token, nome')
      .eq('user_id', user_id)
      .eq('ativo', true)
      .eq('robo', true)
      .eq('apenas_lembretes', false);

    const activeInstances = instancesData || [];
    if (activeInstances.length === 0) {
      await supabase
        .from('acionamento_agendamentos')
        .update({ status: 'concluido' })
        .eq('id', id);
      return new Response(JSON.stringify({ error: 'Sem instâncias ativas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate by phone
    const seenPhones = new Set<string>();
    const uniqueClientes = clientes.filter(c => {
      const phone = c.telefone.replace(/\D/g, '');
      if (seenPhones.has(phone)) return false;
      seenPhones.add(phone);
      return true;
    });

    let totalEnviados = 0;
    let totalErros = 0;
    let lastMsgIndex: number | null = null;
    let rrCounter = 0;
    const consecutiveErrors: Record<string, number> = {};

    // Daily cap per instance
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const instanceDailyCount: Record<string, number> = {};
    for (const inst of activeInstances) {
      const { count } = await supabase
        .from('whatsapp_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('instancia_id', inst.id)
        .eq('direcao', 'saida')
        .gte('timestamp_msg', todayISO);
      instanceDailyCount[inst.id] = count || 0;
    }

    for (let i = 0; i < uniqueClientes.length; i++) {
      // Check if cancelled
      if (i % 10 === 0 && i > 0) {
        const { data: check } = await supabase
          .from('acionamento_agendamentos')
          .select('status')
          .eq('id', id)
          .single();
        if (check?.status === 'cancelado') break;
      }

      const cliente = uniqueClientes[i];
      const telefoneFormatado = cliente.telefone.replace(/\D/g, '');
      const telefoneCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;

      // Rotate message
      let msgIndex: number;
      if (mensagens.length === 1) {
        msgIndex = 0;
      } else {
        do {
          msgIndex = Math.floor(Math.random() * mensagens.length);
        } while (msgIndex === lastMsgIndex && mensagens.length > 1);
      }
      lastMsgIndex = msgIndex;
      const msg = replaceVariables(mensagens[msgIndex], cliente);

      // Round-robin instance selection
      const availableInstances = activeInstances.filter(inst => 
        (consecutiveErrors[inst.id] || 0) < 3 &&
        (instanceDailyCount[inst.id] || 0) < MAX_MSGS_PER_INSTANCE_PER_DAY
      );
      if (availableInstances.length === 0) {
        console.error('[Agendamento] Todas as instâncias indisponíveis');
        break;
      }
      const instance = availableInstances[rrCounter % availableInstances.length];
      rrCounter++;

      try {
        await sendViaUazapi(instance.server_url, instance.instance_token, telefoneCompleto, msg);
        totalEnviados++;
        consecutiveErrors[instance.id] = 0;
        instanceDailyCount[instance.id] = (instanceDailyCount[instance.id] || 0) + 1;
        console.log(`[Agendamento] Enviado para ${telefoneCompleto} via ${instance.nome || instance.id} (${instanceDailyCount[instance.id]}/${MAX_MSGS_PER_INSTANCE_PER_DAY} hoje)`);

        // Save to inbox with suffix matching
        try {
          await saveToInbox(supabase, instance.id, telefoneCompleto, msg);
        } catch (e) {
          console.error('[Agendamento] Erro ao salvar inbox:', e);
        }
      } catch (err) {
        totalErros++;
        consecutiveErrors[instance.id] = (consecutiveErrors[instance.id] || 0) + 1;
        console.error(`[Agendamento] Erro ao enviar para ${telefoneCompleto}:`, err);
      }

      // Update progress every 5 messages
      if (i % 5 === 0) {
        await supabase
          .from('acionamento_agendamentos')
          .update({ total_enviados: totalEnviados, total_erros: totalErros })
          .eq('id', id);
      }

      // Random delay
      if (i < uniqueClientes.length - 1) {
        const delay = Math.floor(Math.random() * (max_sec - min_sec + 1)) + min_sec;
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }

    await supabase
      .from('acionamento_agendamentos')
      .update({ status: 'concluido', total_enviados: totalEnviados, total_erros: totalErros })
      .eq('id', id);

    return new Response(JSON.stringify({ success: true, totalEnviados, totalErros }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Agendamento] Erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
