import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseAudioRecorderProps {
  instanciaId: string;
  telefone: string;
  serverUrl: string;
  instanceToken: string;
  onSent: () => void;
}

export function useAudioRecorder({ instanciaId, telefone, serverUrl, instanceToken, onSent }: UseAudioRecorderProps) {
  const { toast } = useToast();
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iniciarGravacao = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setGravando(true);
      setTempoGravacao(0);
      timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível acessar o microfone', variant: 'destructive' });
    }
  }, [toast]);

  const cancelarGravacao = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    chunksRef.current = [];
    setGravando(false);
    setTempoGravacao(0);
  }, []);

  const enviarGravacao = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setGravando(false);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];

        if (blob.size === 0) {
          setTempoGravacao(0);
          resolve();
          return;
        }

        setEnviandoAudio(true);
        try {
          const ext = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
          const fileName = `${instanciaId}/${telefone}/${Date.now()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('inbox-media')
            .upload(fileName, blob, { contentType: recorder.mimeType });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from('inbox-media')
            .getPublicUrl(fileName);

          const { data, error } = await supabase.functions.invoke('send-whatsapp-audio', {
            body: {
              telefone,
              audio_url: urlData.publicUrl,
              uazapi_server_url: serverUrl,
              uazapi_instance_token: instanceToken,
              instancia_id: instanciaId,
            },
          });

          if (error) throw error;
          if (data && !data.success) {
            const msg = data.error || 'Erro desconhecido';
            const friendly = msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : msg;
            toast({ title: 'Erro ao enviar áudio', description: friendly, variant: 'destructive' });
            setEnviandoAudio(false);
            setTempoGravacao(0);
            resolve();
            return;
          }
          onSent();
        } catch (err: any) {
          const msg = err.message || '';
          const friendly = msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : msg;
          toast({ title: 'Erro ao enviar áudio', description: friendly, variant: 'destructive' });
        } finally {
          setEnviandoAudio(false);
          setTempoGravacao(0);
        }
        resolve();
      };
      recorder.stop();
    });
  }, [instanciaId, telefone, serverUrl, instanceToken, onSent, toast]);

  const formatTempo = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return {
    gravando,
    tempoGravacao,
    enviandoAudio,
    iniciarGravacao,
    cancelarGravacao,
    enviarGravacao,
    formatTempo,
  };
}
