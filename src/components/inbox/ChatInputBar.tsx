import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Mic, Paperclip, X, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { MensagemRapida } from './MensagensRapidasDialog';

interface MediaSentPayload {
  conteudo: string;
  tipo_conteudo: 'imagem' | 'documento';
  media_url: string;
}

interface ChatInputBarProps {
  instanciaId: string;
  telefone: string;
  serverUrl: string;
  instanceToken: string;
  onTextSent: (texto: string) => Promise<void>;
  onMediaSent: (payload?: MediaSentPayload) => void;
  enviando: boolean;
  externalFile?: File | null;
  onExternalFileHandled?: () => void;
  mensagensRapidas?: MensagemRapida[];
  onBusyChange?: (busy: boolean) => void;
}

export function ChatInputBar({
  instanciaId, telefone, serverUrl, instanceToken,
  onTextSent, onMediaSent, enviando,
  externalFile, onExternalFileHandled,
  mensagensRapidas, onBusyChange,
}: ChatInputBarProps) {
  const { toast } = useToast();
  const [textoMensagem, setTextoMensagem] = useState('');
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    gravando, tempoGravacao, enviandoAudio,
    iniciarGravacao, cancelarGravacao, enviarGravacao, formatTempo,
  } = useAudioRecorder({
    instanciaId, telefone, serverUrl, instanceToken,
    onSent: () => onMediaSent(),
  });

  const handleFileSend = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      toast({ title: 'Arquivo inválido', description: 'Envie apenas imagens ou PDFs', variant: 'destructive' });
      return;
    }

    setEnviandoArquivo(true);
    try {
      const ext = file.name.split('.').pop() || (isImage ? 'jpg' : 'pdf');
      const fileName = `${instanciaId}/${telefone}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('inbox-media')
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('inbox-media')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      const { data, error } = await supabase.functions.invoke('send-whatsapp-media', {
        body: {
          telefone,
          media_url: publicUrl,
          type: isImage ? 'image' : 'document',
          uazapi_server_url: serverUrl,
          uazapi_instance_token: instanceToken,
          instancia_id: instanciaId,
          file_name: file.name,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar');

      onMediaSent({
        conteudo: isImage ? '📷 Imagem enviada' : `📄 ${file.name}`,
        tipo_conteudo: isImage ? 'imagem' : 'documento',
        media_url: publicUrl,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar arquivo', description: err.message, variant: 'destructive' });
    } finally {
      setEnviandoArquivo(false);
    }
  };

  useEffect(() => {
    if (externalFile) {
      handleFileSend(externalFile);
      onExternalFileHandled?.();
    }
  }, [externalFile]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await handleFileSend(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const namedFile = new File([file], `clipboard-${Date.now()}.png`, { type: file.type });
          handleFileSend(namedFile);
        }
        return;
      }
    }
  };

  const handleEnviarTexto = async () => {
    if (!textoMensagem.trim() || enviando) return;
    const texto = textoMensagem.trim();
    setTextoMensagem('');
    await onTextSent(texto);
  };

  const isLoading = enviando || enviandoAudio || enviandoArquivo;
  const [enviandoAtalho, setEnviandoAtalho] = useState<string | null>(null);

  // Report busy state to parent
  useEffect(() => {
    onBusyChange?.(isLoading || !!enviandoAtalho);
  }, [isLoading, enviandoAtalho]);

  const handleAtalhoClick = async (atalho: MensagemRapida) => {
    if (isLoading || enviandoAtalho) return;
    setEnviandoAtalho(atalho.id);
    try {
      if (atalho.tipo === 'texto' && atalho.conteudo) {
        await onTextSent(atalho.conteudo);
      } else if (atalho.tipo === 'audio' && atalho.audio_url) {
        const { data, error } = await supabase.functions.invoke('send-whatsapp-audio', {
          body: { telefone, audio_url: atalho.audio_url, uazapi_server_url: serverUrl, uazapi_instance_token: instanceToken, instancia_id: instanciaId },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha ao enviar áudio');
        onMediaSent();
      } else if (atalho.tipo === 'botoes' && atalho.botoes_texto) {
        const { data, error } = await supabase.functions.invoke('send-whatsapp-buttons', {
          body: { telefone, text: atalho.botoes_texto, choices: atalho.botoes_choices || [], uazapi_server_url: serverUrl, uazapi_instance_token: instanceToken, instancia_id: instanciaId },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha ao enviar botões');
        onMediaSent();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar atalho', description: err.message, variant: 'destructive' });
    } finally {
      setEnviandoAtalho(null);
    }
  };

  if (gravando) {
    return (
      <div className="p-3 border-t border-border bg-card flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={cancelarGravacao}>
          <X className="h-4 w-4 text-destructive" />
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm text-destructive font-medium">Gravando {formatTempo(tempoGravacao)}</span>
        </div>
        <Button size="icon" onClick={enviarGravacao} disabled={enviandoAudio}>
          {enviandoAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card">
      {mensagensRapidas && mensagensRapidas.length > 0 && (
        <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {mensagensRapidas.map(atalho => (
            <Button
              key={atalho.id}
              variant="outline"
              size="sm"
              className="shrink-0 text-xs h-7 px-2.5"
              disabled={isLoading || !!enviandoAtalho}
              onClick={() => handleAtalhoClick(atalho)}
            >
              {enviandoAtalho === atalho.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              {atalho.titulo}
            </Button>
          ))}
        </div>
      )}
      <div className="p-3 flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,.pdf"
          onChange={handleFileChange}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="shrink-0"
        >
          {enviandoArquivo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Input
          placeholder="Digite uma mensagem..."
          value={textoMensagem}
          onChange={e => setTextoMensagem(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleEnviarTexto();
            }
          }}
          onPaste={handlePaste}
          disabled={isLoading}
          className="flex-1"
        />
        {textoMensagem.trim() ? (
          <Button onClick={handleEnviarTexto} disabled={isLoading} size="icon" className="shrink-0">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={iniciarGravacao}
            disabled={isLoading}
            className="shrink-0"
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
