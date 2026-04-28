import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClienteData {
  cpf: string;
  nome: string;
  telefone: string;
  atraso: string;
  saldo: number;
}

export interface UazapiInstance {
  id?: string;
  server_url: string;
  instance_token: string;
  nome?: string;
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

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

interface AutoSendProgress {
  current: number;
  total: number;
}

interface AutoSendContextType {
  autoSending: boolean;
  autoProgress: AutoSendProgress | null;
  sendStatus: Record<number, SendStatus>;
  sendTimestamps: Record<number, string>;
  startAutoSend: (params: {
    clientes: ClienteData[];
    mensagensSalvas: string[];
    uazapiConfigs: UazapiInstance[];
    minSec: number;
    maxSec: number;
    historicoId: string | null;
    userId: string;
    existingStatus: Record<number, SendStatus>;
    existingChecked: Set<number>;
  }) => void;
  stopAutoSend: () => void;
}

const AutoSendContext = createContext<AutoSendContextType | undefined>(undefined);

const SEND_STATUS_BASE = 'acionamento_send_status';
const SEND_TIMESTAMPS_BASE = 'acionamento_send_timestamps';

export function AutoSendProvider({ children }: { children: ReactNode }) {
  const [autoSending, setAutoSending] = useState(false);
  const [autoProgress, setAutoProgress] = useState<AutoSendProgress | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<number, SendStatus>>({});
  const [sendTimestamps, setSendTimestamps] = useState<Record<number, string>>({});

  const autoSendingRef = useRef(false);
  const lastUsedMsgIndexRef = useRef<number | null>(null);
  const roundRobinCounterRef = useRef(0);
  const consecutiveErrorsRef = useRef<Record<string, number>>({});
  const disabledInstancesRef = useRef<Set<string>>(new Set());
  const getRotatedMessage = (mensagensSalvas: string[]): string | null => {
    if (mensagensSalvas.length === 0) return null;
    if (mensagensSalvas.length === 1) {
      lastUsedMsgIndexRef.current = 0;
      return mensagensSalvas[0];
    }
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * mensagensSalvas.length);
    } while (newIndex === lastUsedMsgIndexRef.current);
    lastUsedMsgIndexRef.current = newIndex;
    return mensagensSalvas[newIndex];
  };

  const getInstanceKey = (config: UazapiInstance) => `${config.server_url}::${config.instance_token}`;

  const sendSingle = async (
    cliente: ClienteData,
    index: number,
    mensagensSalvas: string[],
    uazapiConfig: UazapiInstance | null,
    historicoId: string | null,
    userId: string,
  ) => {
    const template = getRotatedMessage(mensagensSalvas);
    if (!template) return;

    setSendStatus(prev => {
      const next = { ...prev, [index]: 'sending' as SendStatus };
      return next;
    });

    try {
      const msg = replaceVariables(template, cliente);
      const body: any = { telefone: cliente.telefone, mensagem: msg };
      if (uazapiConfig) {
        body.uazapi_server_url = uazapiConfig.server_url;
        body.uazapi_instance_token = uazapiConfig.instance_token;
        if (uazapiConfig.id) body.instancia_id = uazapiConfig.id;
      }
      const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Erro');

      // Reset consecutive errors on success
      if (uazapiConfig) {
        const key = getInstanceKey(uazapiConfig);
        consecutiveErrorsRef.current[key] = 0;
      }

      const configName = uazapiConfig?.nome || '';
      setSendStatus(prev => {
        const next = { ...prev, [index]: 'success' as SendStatus };
        if (historicoId) localStorage.setItem(`${SEND_STATUS_BASE}_${userId}_${historicoId}`, JSON.stringify(next));
        return next;
      });
      setSendTimestamps(prev => {
        const next = { ...prev, [index]: new Date().toISOString() };
        if (historicoId) localStorage.setItem(`${SEND_TIMESTAMPS_BASE}_${userId}_${historicoId}`, JSON.stringify(next));
        return next;
      });
      const suffix = configName ? ` (via ${configName})` : '';
      toast.success(`Mensagem enviada para ${formatPrimeiroNome(cliente.nome)}${suffix}`);

      // Pre-hydrate chatbot state if message contains offer keywords
      const msgLower = msg.toLowerCase();
      if (msgLower.includes('50% de desconto') || msgLower.includes('parcelas em aberto')) {
        try {
          const cleanPhone = cliente.telefone.replace(/\D/g, '');
          const phoneFull = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
          // Use phone as-is (BR mobile numbers have 9 digits: 55 + DDD(2) + 9 digits = 13 chars)
          const phoneWhatsApp = phoneFull;
          const saldo = cliente.saldo;
          const valorAvista = saldo * 0.5;
          const valorParcelado = saldo * 0.7;
          let maxParcelas = 1;
          for (let p = 24; p >= 2; p--) {
            if (valorParcelado / p >= 100) { maxParcelas = p; break; }
          }
          if (maxParcelas < 2) maxParcelas = 2;

          await supabase.from('chatbot_conversas').upsert({
            telefone: phoneWhatsApp,
            etapa: 'proposta_enviada',
            dados: {
              cpf: cliente.cpf.replace(/\D/g, ''),
              nome: cliente.nome,
              valor_total: saldo,
              valor_avista: valorAvista,
              valor_parcelado: valorParcelado,
              max_parcelas: maxParcelas,
              credor: 'Loja Novo Mundo',
            },
            server_url: uazapiConfig?.server_url || null,
            instance_token: uazapiConfig?.instance_token || null,
            atualizado_em: new Date().toISOString(),
          }, { onConflict: 'telefone' });

          console.log(`[AutoSend] Chatbot state pre-hydrated for ${phoneFull} (saldo: ${saldo})`);
        } catch (e) {
          console.error('[AutoSend] Failed to pre-hydrate chatbot state:', e);
        }
      }
    } catch (err: any) {
      setSendStatus(prev => {
        const next = { ...prev, [index]: 'error' as SendStatus };
        if (historicoId) localStorage.setItem(`${SEND_STATUS_BASE}_${userId}_${historicoId}`, JSON.stringify(next));
        return next;
      });
      const errMsg = err.message || '';
      const isDisconnected = errMsg.toLowerCase().includes('disconnected') || errMsg.includes('503');
      const instanceName = uazapiConfig?.nome || 'Sem nome';
      if (isDisconnected) {
        toast.error(`WhatsApp "${instanceName}" está desconectado. Reconecte o aparelho.`);
      } else {
        toast.error(`Falha ao enviar para ${formatPrimeiroNome(cliente.nome)}: ${errMsg}`);
      }

      // Track consecutive errors and auto-deactivate after 3
      if (uazapiConfig) {
        const key = getInstanceKey(uazapiConfig);
        const count = (consecutiveErrorsRef.current[key] || 0) + 1;
        consecutiveErrorsRef.current[key] = count;

        if (count >= 3 && !disabledInstancesRef.current.has(key)) {
          disabledInstancesRef.current.add(key);
          const instanceName = uazapiConfig.nome || 'Sem nome';
          toast.warning(`WhatsApp "${instanceName}" desativado automaticamente após falhas consecutivas`);
          
          // Deactivate in database
          supabase
            .from('user_whatsapp_instances')
            .update({ ativo: false })
            .eq('instance_token', uazapiConfig.instance_token)
            .eq('server_url', uazapiConfig.server_url)
            .then();
        }
      }
    }
  };

  const startAutoSend = useCallback(({ clientes, mensagensSalvas, uazapiConfigs, minSec, maxSec, historicoId, userId, existingStatus, existingChecked }: {
    clientes: ClienteData[];
    mensagensSalvas: string[];
    uazapiConfigs: UazapiInstance[];
    minSec: number;
    maxSec: number;
    historicoId: string | null;
    userId: string;
    existingStatus: Record<number, SendStatus>;
    existingChecked: Set<number>;
  }) => {
    if (autoSendingRef.current) return;

    setSendStatus(existingStatus);
    roundRobinCounterRef.current = 0;
    consecutiveErrorsRef.current = {};
    disabledInstancesRef.current = new Set();

    // Deduplicate by phone number - keep first occurrence only
    const seenPhones = new Set<string>();
    const pendentesSnapshot = clientes
      .map((c, i) => ({ ...c, originalIndex: i }))
      .filter(c => existingStatus[c.originalIndex] !== 'success' && existingStatus[c.originalIndex] !== 'error' && !existingChecked.has(c.originalIndex))
      .filter(c => {
        const phone = c.telefone.replace(/\D/g, '');
        if (seenPhones.has(phone)) return false;
        seenPhones.add(phone);
        return true;
      });

    if (pendentesSnapshot.length === 0) {
      toast.error('Não há clientes pendentes para enviar');
      return;
    }

    autoSendingRef.current = true;
    setAutoSending(true);

    const run = async () => {
      let lastDelay = -1;
      let activeConfigs = [...uazapiConfigs];

      for (let i = 0; i < pendentesSnapshot.length; i++) {
        if (!autoSendingRef.current) break;

        // Filter out disabled instances
        activeConfigs = activeConfigs.filter(c => !disabledInstancesRef.current.has(getInstanceKey(c)));

        setAutoProgress({ current: i + 1, total: pendentesSnapshot.length });

        const cliente = pendentesSnapshot[i];
        
        // Round-robin: pick config from active configs
        const currentConfig = activeConfigs.length > 0
          ? activeConfigs[roundRobinCounterRef.current % activeConfigs.length]
          : null;
        roundRobinCounterRef.current++;

        const configLabel = currentConfig?.nome || currentConfig?.server_url?.split('/').pop() || 'global';
        console.log(`[AutoSend] Enviando para ${cliente.telefone} via instância "${configLabel}" (RR #${roundRobinCounterRef.current})`);
        await sendSingle(cliente, cliente.originalIndex, mensagensSalvas, currentConfig, historicoId, userId);

        if (i < pendentesSnapshot.length - 1 && autoSendingRef.current) {
          let delay: number;
          do {
            delay = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
          } while (delay === lastDelay && maxSec - minSec >= 1);
          lastDelay = delay;
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }

      autoSendingRef.current = false;
      setAutoSending(false);
      setAutoProgress(null);
      if (pendentesSnapshot.length > 0) {
        toast.success('Envio automático finalizado');
      }
    };

    run();
  }, []);

  const stopAutoSend = useCallback(() => {
    autoSendingRef.current = false;
    setAutoSending(false);
    setAutoProgress(null);
    toast.info('Envio automático parado');
  }, []);

  return (
    <AutoSendContext.Provider value={{ autoSending, autoProgress, sendStatus, sendTimestamps, startAutoSend, stopAutoSend }}>
      {children}
    </AutoSendContext.Provider>
  );
}

export function useAutoSend() {
  const context = useContext(AutoSendContext);
  if (context === undefined) {
    throw new Error('useAutoSend must be used within an AutoSendProvider');
  }
  return context;
}
