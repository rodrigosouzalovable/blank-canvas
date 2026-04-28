import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface VoiceCampaignInstance {
  id: string;
  server_url: string;
  instance_token: string;
  nome?: string | null;
}

interface VoiceCampaignAudio {
  audio_url: string;
  file_name: string;
}

interface VoiceCampaignContact {
  id: string;
  telefone: string;
  nome: string | null;
}

interface StartCampaignParams {
  campaignId: string;
  instances: VoiceCampaignInstance[];
  audioList: VoiceCampaignAudio[];
  pendingContacts: VoiceCampaignContact[];
  initialSent: number;
  initialErrors: number;
  delayMin: number;
  delayMax: number;
}

interface SendingProgress {
  sent: number;
  errors: number;
  total: number;
  currentContact: string | null;
  lastSentContact: string | null;
  lastSentInstance: string | null;
  nextDelaySec: number | null;
  countdownSec: number | null;
}

interface VoiceCampaignSendingContextType {
  sendingCampaignId: string | null;
  sendingProgress: SendingProgress | null;
  startCampaign: (params: StartCampaignParams) => void;
  cancelCampaign: () => void;
}

const VoiceCampaignSendingContext = createContext<VoiceCampaignSendingContextType | null>(null);

export function VoiceCampaignSendingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [sendingProgress, setSendingProgress] = useState<SendingProgress | null>(null);
  const cancelRef = useRef(false);
  const sendingRef = useRef(false);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayResolveRef = useRef<(() => void) | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer effect
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    let remaining = seconds;
    setSendingProgress(prev => prev ? { ...prev, countdownSec: remaining } : null);
    countdownRef.current = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setSendingProgress(prev => prev ? { ...prev, countdownSec: null } : null);
      } else {
        setSendingProgress(prev => prev ? { ...prev, countdownSec: remaining } : null);
      }
    }, 1000);
  }, []);

  const startCampaign = useCallback((params: StartCampaignParams) => {
    if (sendingRef.current) {
      toast.error('Já existe uma campanha em andamento');
      return;
    }

    const { campaignId, instances, audioList, pendingContacts, initialSent, initialErrors, delayMin, delayMax } = params;

    sendingRef.current = true;
    cancelRef.current = false;
    setSendingCampaignId(campaignId);
    setSendingProgress({
      sent: initialSent,
      errors: initialErrors,
      total: initialSent + initialErrors + pendingContacts.length,
      currentContact: null,
      lastSentContact: null,
      lastSentInstance: null,
      nextDelaySec: null,
      countdownSec: null,
    });

    (async () => {
      await supabase
        .from('voice_campaigns')
        .update({ status: 'enviando', started_at: new Date().toISOString() } as any)
        .eq('id', campaignId);
      queryClient.invalidateQueries({ queryKey: ['voice-campaigns'] });

      toast.success(`Iniciando envio para ${pendingContacts.length} contatos com ${audioList.length} áudio(s) e ${instances.length} WhatsApp(s)...`);

      let sent = initialSent;
      let errors = initialErrors;
      let lastDelaySec = -1;

      for (let i = 0; i < pendingContacts.length; i++) {
        if (cancelRef.current) break;
        const contact = pendingContacts[i];
        const instance = instances[i % instances.length];
        const audio = audioList[i % audioList.length];

        setSendingProgress(prev => prev ? {
          ...prev,
          currentContact: contact.nome || contact.telefone,
          countdownSec: null,
          nextDelaySec: null,
        } : null);

        let success = false;
        try {
          const { data, error: fnError } = await supabase.functions.invoke('send-whatsapp-audio', {
            body: {
              telefone: contact.telefone,
              audio_url: audio.audio_url,
              uazapi_server_url: instance.server_url,
              uazapi_instance_token: instance.instance_token,
              instancia_id: instance.id,
            },
          });

          if (fnError || !data?.success) {
            const errMsg = fnError?.message || data?.error || 'Erro';
            await supabase.from('voice_campaign_contacts').update({ status: 'erro', erro_mensagem: errMsg } as any).eq('id', contact.id);
            errors++;
          } else {
            await supabase.from('voice_campaign_contacts').update({ status: 'enviado', enviado_em: new Date().toISOString() } as any).eq('id', contact.id);
            sent++;
            success = true;
          }
        } catch (err: any) {
          await supabase.from('voice_campaign_contacts').update({ status: 'erro', erro_mensagem: err.message } as any).eq('id', contact.id);
          errors++;
        }

        const contactLabel = contact.nome || contact.telefone;
        const instanceLabel = instance.nome || instance.id.slice(0, 8);

        setSendingProgress(prev => prev ? {
          ...prev,
          sent,
          errors,
          lastSentContact: contactLabel,
          lastSentInstance: instanceLabel,
        } : null);

        await supabase.from('voice_campaigns').update({ total_sent: sent, total_errors: errors } as any).eq('id', campaignId);
        queryClient.invalidateQueries({ queryKey: ['voice-campaign-contacts', campaignId] });

        // Random delay between sends (in seconds, never same as previous)
        if (i < pendingContacts.length - 1 && !cancelRef.current) {
          const min = Math.max(1, Math.round(delayMin));
          const max = Math.max(min + 1, Math.round(delayMax));
          let delaySec: number;
          do {
            delaySec = min + Math.floor(Math.random() * (max - min + 1));
          } while (i > 0 && delaySec === lastDelaySec);
          lastDelaySec = delaySec;
          const delay = delaySec * 1000;

          setSendingProgress(prev => prev ? {
            ...prev,
            nextDelaySec: delaySec,
          } : null);

          startCountdown(delaySec);

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

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      const finalStatus = cancelRef.current ? 'cancelado' : 'concluido';
      await supabase.from('voice_campaigns').update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        total_sent: sent,
        total_errors: errors,
      } as any).eq('id', campaignId);

      setSendingCampaignId(null);
      setSendingProgress(null);
      sendingRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['voice-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['voice-campaign-contacts', campaignId] });
      toast.success(cancelRef.current ? 'Campanha cancelada' : 'Campanha finalizada!');
    })();
  }, [queryClient, startCountdown]);

  const cancelCampaign = useCallback(() => {
    cancelRef.current = true;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (delayResolveRef.current) {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      delayResolveRef.current();
      delayResolveRef.current = null;
    }
  }, []);

  return (
    <VoiceCampaignSendingContext.Provider value={{ sendingCampaignId, sendingProgress, startCampaign, cancelCampaign }}>
      {children}
    </VoiceCampaignSendingContext.Provider>
  );
}

export function useVoiceCampaignSending() {
  const ctx = useContext(VoiceCampaignSendingContext);
  if (!ctx) throw new Error('useVoiceCampaignSending must be used within VoiceCampaignSendingProvider');
  return ctx;
}
