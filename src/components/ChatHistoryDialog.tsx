import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle } from 'lucide-react';

interface ChatMessage {
  role: string;
  content: string;
  ts?: string;
}

interface ConversaData {
  etapa: string;
  historico: ChatMessage[];
  telefone: string;
  clienteNome: string;
}

interface ChatHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversa: ConversaData | null;
}

const etapaLabels: Record<string, { label: string; color: string }> = {
  proposta_enviada: { label: 'Proposta Enviada', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  aguardando_cpf: { label: 'Aguardando CPF', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  aguardando_humano: { label: 'Aguardando Humano', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  negociando: { label: 'Negociando', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  acordo_finalizado: { label: 'Acordo Finalizado', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  oferta_avista: { label: 'Oferta À Vista', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  oferta_parcelado: { label: 'Oferta Parcelado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  escolhendo_parcelas: { label: 'Escolhendo Parcelas', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  confirmando_dados: { label: 'Confirmando Dados', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

const formatTs = (ts?: string) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function ChatHistoryDialog({ open, onOpenChange, conversa }: ChatHistoryDialogProps) {
  if (!conversa) return null;

  const etapaInfo = etapaLabels[conversa.etapa] || { label: conversa.etapa, color: 'bg-muted text-muted-foreground' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Conversa - {conversa.clienteNome}
          </DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm text-muted-foreground">{conversa.telefone}</span>
            <Badge variant="outline" className={etapaInfo.color}>
              {etapaInfo.label}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh] pr-2">
          <div className="space-y-3 py-2">
            {conversa.historico.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma mensagem registrada ainda
              </p>
            ) : (
              conversa.historico.map((msg, i) => {
                const isAssistant = msg.role === 'assistente' || msg.role === 'assistant';
                return (
                  <div
                    key={i}
                    className={`flex ${isAssistant ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isAssistant
                          ? 'bg-green-700/80 text-green-50'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      {msg.ts && (
                        <p className={`text-[10px] mt-1 ${isAssistant ? 'text-green-300' : 'text-muted-foreground'}`}>
                          {formatTs(msg.ts)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
