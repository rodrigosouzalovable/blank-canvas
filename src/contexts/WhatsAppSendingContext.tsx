import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface SendQueueItem {
  id: string; // pagamento_id
  cliente_nome: string;
  cliente_telefone: string;
  valor_parcela?: number;
  data_prevista?: string;
  tipo: string;
  acordo_id?: string;
}

interface WhatsAppInstance {
  id: string;
  nome: string | null;
  server_url: string;
  instance_token: string;
}

interface LembreteTemplate {
  tipo_lembrete: string;
  mensagem: string;
  audio_url?: string | null;
  botoes_texto?: string | null;
  botoes_choices?: string[] | null;
}

interface EnvioProgressItem {
  pagamento_id: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  status: string;
  enviado_em: string | null;
}

interface SendingOptions {
  minDelayMin: number;
  maxDelayMin: number;
  tipoEnvio: 'texto' | 'audio' | 'audio_botoes';
}

interface WhatsAppSendingContextType {
  isSending: boolean;
  currentSendingId: string | null;
  statusMap: Record<string, 'enviado' | 'erro' | 'enviando'>;
  envioProgresso: EnvioProgressItem[];
  startSending: (items: SendQueueItem[], instances: WhatsAppInstance[], templates: LembreteTemplate[], operadorNome: string, options?: SendingOptions) => void;
  cancelSending: () => void;
  loadSavedProgress: () => Promise<void>;
  markAsEnviado: (pagamentoId: string, clienteNome: string, clienteTelefone: string) => Promise<void>;
  sendSingleMessage: (item: SendQueueItem, instance: WhatsAppInstance, templates: LembreteTemplate[], operadorNome: string) => Promise<void>;
}

const WhatsAppSendingContext = createContext<WhatsAppSendingContextType | null>(null);

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function substituirVariaveis(template: string, vars: {
  nome_cliente: string;
  primeiro_nome: string;
  nome_operador: string;
  valor: string;
  data_vencimento: string;
  dias_atraso: number;
}): string {
  return template
    .replace(/\{nome_cliente\}/g, vars.nome_cliente)
    .replace(/\{primeiro_nome\}/g, vars.primeiro_nome)
    .replace(/\{nome_operador\}/g, vars.nome_operador)
    .replace(/\{valor\}/g, vars.valor)
    .replace(/\{data_vencimento\}/g, vars.data_vencimento)
    .replace(/\{dias_atraso\}/g, String(vars.dias_atraso));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function gerarMensagem(
  lembrete: SendQueueItem,
  templates: LembreteTemplate[],
  operadorNome: string
): string {
  const nomeCompleto = toTitleCase(lembrete.cliente_nome || 'Cliente');
  const primeiroNome = nomeCompleto.split(' ')[0];
  const valor = lembrete.valor_parcela ? formatCurrency(lembrete.valor_parcela) : '';
  const dataStr = lembrete.data_prevista
    ? new Date(lembrete.data_prevista + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';

  const hoje = new Date();
  const venc = new Date((lembrete.data_prevista || '') + 'T00:00:00');
  const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));

  let tipoKey = '';
  if (lembrete.tipo === 'vencido') {
    tipoKey = `vencido_d${diasAtraso}`;
  } else if (lembrete.tipo === 'hoje') {
    tipoKey = 'dia_vencimento';
  } else {
    tipoKey = '3_dias';
  }

  let matched = templates.filter(t => t.tipo_lembrete === tipoKey);

  if (matched.length === 0 && lembrete.tipo === 'vencido') {
    const vencidoTemplates = templates
      .filter(t => t.tipo_lembrete.startsWith('vencido_d'))
      .map(t => ({ ...t, dias: parseInt(t.tipo_lembrete.replace('vencido_d', ''), 10) }))
      .filter(t => !isNaN(t.dias))
      .sort((a, b) => b.dias - a.dias);
    const closest = vencidoTemplates.find(t => t.dias <= diasAtraso);
    if (closest) matched = templates.filter(t => t.tipo_lembrete === `vencido_d${closest.dias}`);
  }

  if (matched.length > 0) {
    const chosen = matched[Math.floor(Math.random() * matched.length)];
    return substituirVariaveis(chosen.mensagem, {
      nome_cliente: nomeCompleto,
      primeiro_nome: primeiroNome,
      nome_operador: operadorNome || 'Operador',
      valor,
      data_vencimento: dataStr,
      dias_atraso: diasAtraso,
    });
  }

  // Fallback
  if (lembrete.tipo === 'vencido') {
    return `Olá ${primeiroNome}, tudo bem? Identificamos que a parcela${valor ? ` de ${valor}` : ''} com vencimento em ${dataStr} encontra-se em aberto há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}. Por favor, regularize o pagamento e envie o comprovante. Caso já tenha efetuado o pagamento, desconsidere esta mensagem.`;
  }
  if (lembrete.tipo === 'hoje') {
    return `Olá ${primeiroNome}, tudo bem? Lembramos que hoje é o vencimento da sua parcela${valor ? ` de ${valor}` : ''}. Por favor, efetue o pagamento e nos envie o comprovante. Obrigado!`;
  }
  return `Olá ${primeiroNome}, tudo bem? Informamos que sua parcela${valor ? ` de ${valor}` : ''} vence em ${dataStr}. Fique atento para não perder o prazo!`;
}

export function WhatsAppSendingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [currentSendingId, setCurrentSendingId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, 'enviado' | 'erro' | 'enviando'>>({});
  const [envioProgresso, setEnvioProgresso] = useState<EnvioProgressItem[]>([]);
  const cancelRef = useRef(false);
  const sendingRef = useRef(false);
  const delayResolveRef = useRef<(() => void) | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved progress from DB on mount
  const loadSavedProgress = useCallback(async () => {
    if (!user) return;
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    const { data } = await supabase
      .from('lembrete_envio_progresso')
      .select('pagamento_id, cliente_nome, cliente_telefone, status, enviado_em')
      .eq('user_id', user.id)
      .eq('data_envio', hojeStr)
      .order('criado_em', { ascending: true });

    if (data && data.length > 0) {
      setEnvioProgresso(data);
      const newStatusMap: Record<string, 'enviado' | 'erro'> = {};
      data.forEach(item => {
        if (item.status === 'enviado' || item.status === 'erro') {
          newStatusMap[item.pagamento_id] = item.status as 'enviado' | 'erro';
        }
      });
      setStatusMap(newStatusMap);
    }
  }, [user]);

  useEffect(() => {
    loadSavedProgress();
  }, [loadSavedProgress]);

  const startSending = useCallback((
    items: SendQueueItem[],
    instances: WhatsAppInstance[],
    templates: LembreteTemplate[],
    operadorNome: string,
    options?: SendingOptions
  ) => {
    if (sendingRef.current || !user || items.length === 0 || instances.length === 0) return;
    const minDelayMs = (options?.minDelayMin ?? 5) * 1000;
    const maxDelayMs = (options?.maxDelayMin ?? 15) * 1000;
    const tipoEnvio = options?.tipoEnvio ?? 'texto';

    sendingRef.current = true;
    setIsSending(true);
    cancelRef.current = false;
    toast.success(`Iniciando envio de ${items.length} lembrete${items.length > 1 ? 's' : ''}...`);

    (async () => {
      for (let i = 0; i < items.length; i++) {
        if (cancelRef.current) break;

        const lembrete = items[i];
        const instance = instances[i % instances.length];

        setCurrentSendingId(lembrete.id);
        setStatusMap(prev => ({ ...prev, [lembrete.id]: 'enviando' }));

        let status: 'enviado' | 'erro' = 'erro';
        let erroMsg: string | null = null;

        try {
          // Determine template for this reminder type
          const hoje = new Date();
          const venc = new Date((lembrete.data_prevista || '') + 'T00:00:00');
          const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));
          let tipoKey = '';
          if (lembrete.tipo === 'vencido') tipoKey = `vencido_d${diasAtraso}`;
          else if (lembrete.tipo === 'hoje') tipoKey = 'dia_vencimento';
          else tipoKey = '3_dias';

          let tpl = templates.find(t => t.tipo_lembrete === tipoKey);
          if (!tpl && lembrete.tipo === 'vencido') {
            // Fallback em cascata: buscar template mais próximo com dias menores
            const vencidoTemplates = templates
              .filter(t => t.tipo_lembrete.startsWith('vencido_d') && t.tipo_lembrete !== 'vencido_generico')
              .map(t => ({ ...t, dias: parseInt(t.tipo_lembrete.replace('vencido_d', '')) }))
              .filter(t => !isNaN(t.dias) && t.dias <= diasAtraso)
              .sort((a, b) => b.dias - a.dias);
            tpl = vencidoTemplates[0] || templates.find(t => t.tipo_lembrete === 'vencido_generico');
          }

          let sentAsAudio = false;

          // Send audio for 'audio' or 'audio_botoes'
          if (tipoEnvio === 'audio' || tipoEnvio === 'audio_botoes') {
            if (tpl?.audio_url) {
              sentAsAudio = true;
              const { data, error } = await supabase.functions.invoke('send-whatsapp-audio', {
                body: {
                  telefone: lembrete.cliente_telefone,
                  audio_url: tpl.audio_url,
                  uazapi_server_url: instance.server_url,
                  uazapi_instance_token: instance.instance_token,
                  instancia_id: instance.id,
                },
              });
              if (error || !data?.success) {
                status = 'erro';
                erroMsg = error?.message || data?.error || 'Erro desconhecido';
              } else {
                status = 'enviado';
              }
            }
          }

          // Send buttons after audio for 'audio_botoes'
          if (tipoEnvio === 'audio_botoes' && sentAsAudio && status === 'enviado') {
            if (tpl?.botoes_texto && tpl?.botoes_choices && tpl.botoes_choices.length > 0) {
              await new Promise(r => setTimeout(r, 3000));

              const primeiroNome = lembrete.cliente_nome?.split(' ')[0] || '';
              const nomeFormatado = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
              const nomeCompleto = toTitleCase(lembrete.cliente_nome || '');
              const textoFinal = substituirVariaveis(tpl.botoes_texto, {
                nome_cliente: nomeCompleto,
                primeiro_nome: nomeFormatado,
                nome_operador: operadorNome,
                valor: formatCurrency(lembrete.valor_parcela || 0),
                data_vencimento: venc.toLocaleDateString('pt-BR'),
                dias_atraso: diasAtraso,
              });

              const { data: btnData, error: btnError } = await supabase.functions.invoke('send-whatsapp-buttons', {
                body: {
                  telefone: lembrete.cliente_telefone,
                  texto: textoFinal,
                  choices: tpl.botoes_choices,
                  footerText: 'Escolha uma opção',
                  uazapi_server_url: instance.server_url,
                  uazapi_instance_token: instance.instance_token,
                  instancia_id: instance.id,
                },
              });
              if (btnError || !btnData?.success) {
                erroMsg = 'Áudio ok, erro nos botões: ' + (btnError?.message || btnData?.error || '');
              }
            }
          }

          // Send as text if tipo is texto, or audio fallback (no audio_url found)
          if (tipoEnvio === 'texto' || (!sentAsAudio && tipoEnvio !== 'audio_botoes')) {
            const mensagem = gerarMensagem(lembrete, templates, operadorNome);
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
              body: {
                telefone: lembrete.cliente_telefone,
                mensagem,
                uazapi_server_url: instance.server_url,
                uazapi_instance_token: instance.instance_token,
                instancia_id: instance.id,
              },
            });
            if (error || !data?.success) {
              status = 'erro';
              erroMsg = error?.message || data?.error || 'Erro desconhecido';
            } else {
              status = 'enviado';
            }
          }
        } catch (err: any) {
          status = 'erro';
          erroMsg = err?.message || 'Erro de rede';
        }

        setCurrentSendingId(null);
        setStatusMap(prev => ({ ...prev, [lembrete.id]: status }));

        // Persist to DB
        await supabase.from('lembrete_envio_progresso').insert({
          user_id: user.id,
          pagamento_id: lembrete.id,
          cliente_nome: lembrete.cliente_nome,
          cliente_telefone: lembrete.cliente_telefone,
          status,
          erro_mensagem: erroMsg,
          enviado_em: status === 'enviado' ? new Date().toISOString() : null,
        });

        // Update local progress list
        setEnvioProgresso(prev => [...prev, {
          pagamento_id: lembrete.id,
          cliente_nome: lembrete.cliente_nome,
          cliente_telefone: lembrete.cliente_telefone,
          status,
          enviado_em: status === 'enviado' ? new Date().toISOString() : null,
        }]);

        // Wait randomized delay before next (skip on last or cancel)
        if (i < items.length - 1 && !cancelRef.current) {
          const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
          const delaySeconds = Math.round(delay / 1000);
          toast.info(`Próximo envio em ~${delaySeconds} segundos...`);
          await new Promise<void>(resolve => {
            delayResolveRef.current = resolve;
            delayTimerRef.current = setTimeout(() => {
              delayResolveRef.current = null;
              delayTimerRef.current = null;
              resolve();
            }, delay);
          });
        }
      }

      setIsSending(false);
      setCurrentSendingId(null);
      sendingRef.current = false;

      if (cancelRef.current) {
        toast.info('Envio cancelado');
      } else {
        toast.success('Envio finalizado!');
      }
    })();
  }, [user]);

  const cancelSending = useCallback(() => {
    cancelRef.current = true;
    if (delayResolveRef.current) {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      delayResolveRef.current();
      delayResolveRef.current = null;
    }
  }, []);

  const markAsEnviado = useCallback(async (pagamentoId: string, clienteNome: string, clienteTelefone: string) => {
    if (!user) return;
    setStatusMap(prev => ({ ...prev, [pagamentoId]: 'enviado' }));

    await supabase.from('lembrete_envio_progresso').insert({
      user_id: user.id,
      pagamento_id: pagamentoId,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      status: 'enviado',
      enviado_em: new Date().toISOString(),
    });

    setEnvioProgresso(prev => [...prev, {
      pagamento_id: pagamentoId,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      status: 'enviado',
      enviado_em: new Date().toISOString(),
    }]);
  }, [user]);

  const sendSingleMessage = useCallback(async (
    item: SendQueueItem,
    instance: WhatsAppInstance,
    tpls: LembreteTemplate[],
    opNome: string
  ) => {
    if (!user) return;
    setStatusMap(prev => ({ ...prev, [item.id]: 'enviando' }));

    let status: 'enviado' | 'erro' = 'erro';
    let erroMsg: string | null = null;

    try {
      const mensagem = gerarMensagem(item, tpls, opNome);
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          telefone: item.cliente_telefone,
          mensagem,
          uazapi_server_url: instance.server_url,
          uazapi_instance_token: instance.instance_token,
          instancia_id: instance.id,
        },
      });
      if (error || !data?.success) {
        erroMsg = error?.message || data?.error || 'Erro desconhecido';
      } else {
        status = 'enviado';
      }
    } catch (err: any) {
      erroMsg = err?.message || 'Erro de rede';
    }

    setStatusMap(prev => ({ ...prev, [item.id]: status }));

    await supabase.from('lembrete_envio_progresso').insert({
      user_id: user.id,
      pagamento_id: item.id,
      cliente_nome: item.cliente_nome,
      cliente_telefone: item.cliente_telefone,
      status,
      erro_mensagem: erroMsg,
      enviado_em: status === 'enviado' ? new Date().toISOString() : null,
    });

    setEnvioProgresso(prev => [...prev, {
      pagamento_id: item.id,
      cliente_nome: item.cliente_nome,
      cliente_telefone: item.cliente_telefone,
      status,
      enviado_em: status === 'enviado' ? new Date().toISOString() : null,
    }]);

    if (status === 'enviado') {
      const instanceLabel = instance.nome || instance.server_url.replace(/https?:\/\//, '').split('/')[0];
      toast.success(`Mensagem enviada para ${item.cliente_nome}, pelo número ${instanceLabel}`);
    } else {
      toast.error(`Erro ao enviar para ${item.cliente_nome}: ${erroMsg}`);
    }
  }, [user]);

  return (
    <WhatsAppSendingContext.Provider value={{
      isSending,
      currentSendingId,
      statusMap,
      envioProgresso,
      startSending,
      cancelSending,
      loadSavedProgress,
      markAsEnviado,
      sendSingleMessage,
    }}>
      {children}
    </WhatsAppSendingContext.Provider>
  );
}

export function useWhatsAppSending() {
  const ctx = useContext(WhatsAppSendingContext);
  if (!ctx) throw new Error('useWhatsAppSending must be used within WhatsAppSendingProvider');
  return ctx;
}
