import { useState, useEffect, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Send, Trash2, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { InstanceStats } from '@/hooks/useMonitorEnvios';

interface MentorChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contexto: {
    totalEnviadas: number;
    totalAtivas: number;
    totalInstancias: number;
    totalCapacidade: number;
    progresso: number;
    limiteDiario: number;
    delaySegundos: number;
    instances: InstanceStats[];
  };
}

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_CHIPS = [
  'Posso aumentar o limite?',
  'Meu padrão parece robótico?',
  'Qual número está melhor?',
  'Plano de aquecimento semanal',
  'Como evitar bloqueio?',
  'Qual o melhor horário para enviar?',
];

export function MentorChat({ open, onOpenChange, contexto }: MentorChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history once
  useEffect(() => {
    if (!open || !user || historyLoaded) return;
    (async () => {
      const { data } = await supabase
        .from('mentor_conversas')
        .select('role, content')
        .eq('user_id', user.id)
        .order('criado_em', { ascending: true })
        .limit(100);
      if (data && data.length > 0) {
        setMessages(data.map(d => ({ role: d.role as 'user' | 'assistant', content: d.content })));
      }
      setHistoryLoaded(true);
    })();
  }, [open, user, historyLoaded]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const persistMessage = useCallback(async (role: string, content: string) => {
    if (!user) return;
    await supabase.from('mentor_conversas').insert({ user_id: user.id, role, content });
  }, [user]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    await persistMessage('user', userMsg.content);

    let assistantSoFar = '';
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-mentor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
            contexto,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      if (!resp.body) throw new Error('Sem corpo de resposta');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      let done = false;
      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        textBuffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (assistantSoFar) {
        await persistMessage('assistant', assistantSoFar);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao consultar mentora');
      console.error('Mentor error:', e);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    await supabase.from('mentor_conversas').delete().eq('user_id', user.id);
    setMessages([]);
    toast.success('Histórico limpo');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Mestra WA
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={clearHistory} title="Limpar histórico">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Especialista em aquecimento de WhatsApp</p>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8 space-y-2">
              <Bot className="h-10 w-10 mx-auto text-primary/50" />
              <p>Olá! Sou sua especialista em aquecimento de WhatsApp.</p>
              <p>Posso analisar seus números e recomendar estratégias.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`mb-3 flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && <Bot className="h-5 w-5 mt-1 text-primary shrink-0" />}
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'user' && <User className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />}
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === 'user' && (
            <div className="mb-3 flex gap-2 justify-start">
              <Bot className="h-5 w-5 mt-1 text-primary shrink-0" />
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </ScrollArea>

        {/* Quick chips */}
        {messages.length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full hover:bg-secondary/80 transition-colors"
                disabled={loading}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 pt-2 border-t flex gap-2">
          <Textarea
            placeholder="Digite sua pergunta..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[100px] resize-none"
            rows={1}
            disabled={loading}
          />
          <Button size="icon" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
