import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileText, Image as ImageIcon, Loader2, X, Trash2, Ban, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { WhatsAppAudioPlayer } from './WhatsAppAudioPlayer';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Mensagem {
  id: string;
  conteudo: string;
  direcao: string;
  timestamp_msg: string;
  tipo_conteudo?: string;
  media_url?: string | null;
}

interface ChatMessageProps {
  msg: Mensagem;
  formatMsgTime: (ts: string) => string;
  onApagarParaMim?: (msgId: string) => void;
  onApagarParaTodos?: (msgId: string) => void;
  onEditar?: (msgId: string, conteudoAtual: string) => void;
}

function getMimeFromUrl(url: string): string | undefined {
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  const map: Record<string, string> = {
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  return ext ? map[ext] : undefined;
}

function getImageMimeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return (ext && map[ext]) || 'image/jpeg';
}

export function ChatMessage({ msg, formatMsgTime, onApagarParaMim, onApagarParaTodos, onEditar }: ChatMessageProps) {
  const tipo = msg.tipo_conteudo || 'texto';
  const isSaida = msg.direcao === 'saida';
  const isTemp = msg.id.startsWith('temp-');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'mim' | 'todos' | null>(null);
  const lightboxImageSrc = blobUrl || msg.media_url;

  const closeLightbox = useCallback(() => setShowLightbox(false), []);

  useEffect(() => {
    if (!showLightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showLightbox, closeLightbox]);

  useEffect(() => {
    if (tipo !== 'imagem' || !msg.media_url) return;
    let cancelled = false;
    setImgLoading(true);
    setImgError(false);

    fetch(msg.media_url)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      })
      .then(async (blob) => {
        if (cancelled) return;
        const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
        const isPng = header[0] === 0x89 && header[1] === 0x50;
        const isWebp = header[0] === 0x52 && header[1] === 0x49;
        const isGif = header[0] === 0x47 && header[1] === 0x49;

        if (!isJpeg && !isPng && !isWebp && !isGif) {
          console.warn('[ChatMessage] Blob is not valid image data, showing fallback');
          setImgError(true);
          return;
        }

        const mime = getImageMimeFromUrl(msg.media_url!);
        const correctedBlob = blob.type && blob.type !== 'application/octet-stream'
          ? blob
          : new Blob([blob], { type: mime });
        setBlobUrl(URL.createObjectURL(correctedBlob));
      })
      .catch(() => { if (!cancelled) setImgError(true); })
      .finally(() => { if (!cancelled) setImgLoading(false); });

    return () => { cancelled = true; };
  }, [tipo, msg.media_url]);

  useEffect(() => {
    if (tipo !== 'audio' || !msg.media_url) return;
    let cancelled = false;

    fetch(msg.media_url)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      })
      .then(blob => {
        if (cancelled) return;
        const mime = getMimeFromUrl(msg.media_url!) || 'audio/ogg';
        const correctedBlob = blob.type && blob.type !== 'application/octet-stream'
          ? blob
          : new Blob([blob], { type: mime });
        setAudioBlobUrl(URL.createObjectURL(correctedBlob));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [tipo, msg.media_url]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [blobUrl, audioBlobUrl]);

  const renderContent = () => {
    if (tipo !== 'texto' && !msg.media_url && msg.conteudo?.includes('Acesse seu WhatsApp')) {
      return <p className="text-xs italic text-muted-foreground">{msg.conteudo}</p>;
    }

    if (tipo !== 'texto' && !msg.media_url) {
      return <p className="text-xs italic text-muted-foreground">Mídia indisponível</p>;
    }

    if (tipo === 'audio' && msg.media_url) {
      const src = audioBlobUrl || msg.media_url;
      const mimeType = getMimeFromUrl(msg.media_url);
      return (
        <WhatsAppAudioPlayer
          src={src}
          isSaida={isSaida}
          messageId={msg.id}
          mimeType={mimeType}
        />
      );
    }

    if (tipo === 'imagem' && msg.media_url) {
      if (imgLoading) {
        return (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (imgError || !blobUrl) {
        return (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 rounded bg-background/30 hover:bg-background/50 transition">
            <ImageIcon className="h-5 w-5 shrink-0" />
            <span className="text-xs underline">Abrir imagem</span>
          </a>
        );
      }
      return (
        <div className="cursor-zoom-in" onClick={() => setShowLightbox(true)}>
          <img
            src={blobUrl}
            alt="Imagem"
            className="max-w-[250px] rounded-md hover:opacity-90 transition"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    if (tipo === 'documento' && msg.media_url) {
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 rounded bg-background/30 hover:bg-background/50 transition"
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className="text-xs underline truncate">{msg.conteudo || 'Documento'}</span>
        </a>
      );
    }

    return <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>;
  };

  const handleConfirmDelete = () => {
    if (confirmDialog === 'mim' && onApagarParaMim) {
      onApagarParaMim(msg.id);
    } else if (confirmDialog === 'todos' && onApagarParaTodos) {
      onApagarParaTodos(msg.id);
    }
    setConfirmDialog(null);
  };

  const messageBubble = (
    <div className={cn("flex", isSaida ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm overflow-hidden break-words",
          isSaida
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-card text-card-foreground border border-border rounded-bl-none"
        )}
      >
        {renderContent()}
        <p className={cn(
          "text-[10px] mt-1 text-right",
          isSaida ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {formatMsgTime(msg.timestamp_msg)}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {isTemp ? (
        messageBubble
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {messageBubble}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {isSaida && tipo === 'texto' && onEditar && (
              <>
                <ContextMenuItem
                  onClick={() => onEditar(msg.id, msg.conteudo)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem
              onClick={() => setConfirmDialog('mim')}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar pra mim
            </ContextMenuItem>
            {isSaida && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => setConfirmDialog('todos')}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Apagar para todos
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      )}

      <AlertDialog open={confirmDialog !== null} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog === 'todos' ? 'Apagar para todos?' : 'Apagar pra mim?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog === 'todos'
                ? 'Esta mensagem será removida do sistema. Esta ação não pode ser desfeita.'
                : 'Esta mensagem será removida apenas para você. Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className={confirmDialog === 'todos' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showLightbox && lightboxImageSrc && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/90 animate-in fade-in-0 duration-200"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 text-white/80 hover:text-white transition p-2 rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-6 md:p-10">
            <img
              src={lightboxImageSrc}
              alt="Imagem ampliada"
              className="h-full w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
