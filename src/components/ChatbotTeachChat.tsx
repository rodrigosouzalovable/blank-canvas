import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap, Send, Loader2, Bot, User, Trash2, Image, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64 data URL
}

interface Props {
  onRegraCreated: () => void;
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: 'Olá! 👋 Sou sua assistente de treinamento. Me ensine como devo responder seus clientes!\n\nVocê pode me dizer coisas como:\n- *"Quando o cliente perguntar sobre boleto, responda: Vou gerar seu boleto agora!"*\n- *"Se o cliente disser \'quero pagar\', responda com as opções de pagamento"*\n\n📸 Você também pode **colar prints** (Ctrl+V) ou arrastar imagens para eu analisar!\n\nO que você quer me ensinar?'
};

const MAX_IMAGE_SIZE = 1024 * 1024 * 4; // 4MB

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = (height * maxDim) / width; width = maxDim; }
          else { width = (width * maxDim) / height; height = maxDim; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatbotTeachChat({ onRegraCreated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoaded = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingHistory(false); return; }
      const { data, error } = await supabase
        .from('chat_ia_mensagens')
        .select('role, content, image')
        .eq('user_id', user.id)
        .eq('image', 'teach-chatbot')
        .order('criado_em', { ascending: true });
      if (!error && data && data.length > 0) {
        setMessages(data.map(d => ({ role: d.role as 'user' | 'assistant', content: d.content })));
      }
    } catch (e) {
      console.error('Erro ao carregar histórico teach:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const persistMessage = async (msg: ChatMessage) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('chat_ia_mensagens').insert({
        user_id: user.id,
        role: msg.role,
        content: msg.content,
        image: 'teach-chatbot',
      });
    } catch (e) {
      console.error('Erro ao salvar mensagem:', e);
    }
  };

  const processImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são suportadas');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE * 2) {
      toast.error('Imagem muito grande (máx 8MB)');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPendingImage(compressed);
      textareaRef.current?.focus();
    } catch {
      toast.error('Erro ao processar imagem');
    }
  }, []);

  // Handle paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processImage(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [processImage]);

  // Handle drag & drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || sending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text || '(imagem enviada)',
      image: pendingImage || undefined,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setPendingImage(null);
    setSending(true);
    await persistMessage(userMsg);

    try {
      // Build messages for the AI, including image as vision content
      const aiMessages = updatedMessages.map(m => {
        if (m.image) {
          return {
            role: m.role,
            content: [
              ...(m.content && m.content !== '(imagem enviada)' ? [{ type: 'text', text: m.content }] : [{ type: 'text', text: 'Analise esta imagem e me diga o que você vê nela:' }]),
              { type: 'image_url', image_url: { url: m.image } },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

      const { data, error } = await supabase.functions.invoke('teach-chatbot', {
        body: { messages: aiMessages }
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      await persistMessage(assistantMsg);

      if (data.regra_criada) {
        toast.success('Regra criada com sucesso!');
        onRegraCreated();
      }
    } catch (err) {
      console.error('Erro ao ensinar IA:', err);
      toast.error('Erro ao processar. Tente novamente.');
      const errMsg: ChatMessage = { role: 'assistant', content: 'Desculpe, tive um problema. Pode tentar novamente?' };
      setMessages(prev => [...prev, errMsg]);
      await persistMessage(errMsg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('chat_ia_mensagens').delete().eq('user_id', user.id).eq('image', 'teach-chatbot');
      }
    } catch (e) {
      console.error('Erro ao limpar histórico:', e);
    }
    setMessages([{ role: 'assistant', content: 'Conversa reiniciada! 🔄 O que você quer me ensinar agora?' }]);
  };

  return (
    <Card className="flex flex-col h-[500px]" onDrop={handleDrop} onDragOver={handleDragOver}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Ensinar IA
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1 text-xs">
            <Trash2 className="h-3 w-3" />
            Limpar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Converse comigo para me ensinar. Cole prints (Ctrl+V) para eu analisar! 📸
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 gap-3">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loadingHistory ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {msg.image && (
                    <img src={msg.image} alt="Imagem enviada" className="rounded mb-1.5 max-h-48 w-auto" />
                  )}
                  {msg.content !== '(imagem enviada)' && msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Pending image preview */}
        {pendingImage && (
          <div className="relative inline-block self-start">
            <img src={pendingImage} alt="Preview" className="rounded border max-h-20 w-auto" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) processImage(e.target.files[0]); e.target.value = ''; }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 self-end"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Image className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? 'Adicione um texto ou envie a imagem...' : 'Ex: "Quando o cliente pedir boleto, responda: Vou gerar agora!"'}
            rows={2}
            className="text-sm resize-none"
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!input.trim() && !pendingImage) || sending}
            className="shrink-0 self-end"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
