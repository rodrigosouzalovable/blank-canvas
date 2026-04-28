import { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MessageSquare, Phone, ArrowDown, Upload, History, Loader2, Plus, Pin, Tag, X, Pencil, Settings, Archive } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChatMessage } from '@/components/inbox/ChatMessage';
import { ChatInputBar } from '@/components/inbox/ChatInputBar';
import { ConversaContextMenu } from '@/components/inbox/ConversaContextMenu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { MensagensRapidasDialog, type MensagemRapida } from '@/components/inbox/MensagensRapidasDialog';
interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

interface Instancia {
  id: string;
  nome: string | null;
  server_url: string;
  instance_token: string;
}

interface Contato {
  id: string;
  instancia_id: string;
  telefone: string;
  nome: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  nao_lido: number;
  fixado?: boolean;
  arquivado?: boolean;
  instancia_nome?: string | null;
}

interface Mensagem {
  id: string;
  instancia_id: string;
  telefone_remoto: string;
  nome_contato: string | null;
  conteudo: string;
  direcao: string;
  timestamp_msg: string;
  lida: boolean;
  tipo_conteudo?: string;
  media_url?: string | null;
}

interface MediaSentPayload {
  conteudo: string;
  tipo_conteudo: 'imagem' | 'documento';
  media_url: string;
}

const getMessageIdentity = (msg: Pick<Mensagem, 'direcao' | 'tipo_conteudo' | 'media_url' | 'conteudo'>) => (
  `${msg.direcao}|${msg.tipo_conteudo || 'texto'}|${msg.media_url || ''}|${msg.conteudo}`
);

export default function WhatsAppInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [filtroInstancia, setFiltroInstancia] = useState<string>('todas');
  const [busca, setBusca] = useState('');
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<'conversas' | 'arquivados'>('conversas');
  const [arquivadosCount, setArquivadosCount] = useState(0);
  const [contatoAtivo, setContatoAtivo] = useState<Contato | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [contatoEtiquetas, setContatoEtiquetas] = useState<Record<string, string[]>>({});
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string | null>(null);
  const [etiquetaFilterOpen, setEtiquetaFilterOpen] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(0);
  const [temMaisAnteriores, setTemMaisAnteriores] = useState(true);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novaInstanciaId, setNovaInstanciaId] = useState('');
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviandoNova, setEnviandoNova] = useState(false);
  const [instanciaComboOpen, setInstanciaComboOpen] = useState(false);
  const [editandoMsg, setEditandoMsg] = useState<{ id: string; conteudo: string } | null>(null);
  const [editTexto, setEditTexto] = useState('');
  const [mensagensRapidasOpen, setMensagensRapidasOpen] = useState(false);
  const [mensagensRapidas, setMensagensRapidas] = useState<MensagemRapida[]>([]);
  const [inputBusy, setInputBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 200;

  useEffect(() => {
    if (!user) {
      setInstancias([]);
      return;
    }

    const fetchInstancias = async () => {
      // Check if user has inbox_compartilhado permission
      const { data: perms } = await supabase
        .from('user_permissions')
        .select('inbox_compartilhado, acordos_compartilhados, concedido_por')
        .eq('user_id', user.id)
        .maybeSingle();

      const compartilhado = (perms as any)?.inbox_compartilhado === true || (perms as any)?.acordos_compartilhados === true;
      const concedidoPor = (perms as any)?.concedido_por as string | null;

      let query = supabase
        .from('user_whatsapp_instances')
        .select('id, nome, server_url, instance_token, telefone')
        .eq('ativo', true);

      if (compartilhado && concedidoPor) {
        // Show only instances belonging to the admin who granted access
        query = query.eq('user_id', concedidoPor);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data } = await query;
      setInstancias((data as Instancia[]) ?? []);
    };

    fetchInstancias();
  }, [user]);

  const fetchEtiquetas = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_etiquetas')
      .select('id, nome, cor')
      .order('criado_em', { ascending: true });
    if (data) setEtiquetas(data as Etiqueta[]);
  }, []);

  const fetchContatoEtiquetas = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_contato_etiquetas')
      .select('contato_id, etiqueta_id');
    if (data) {
      const map: Record<string, string[]> = {};
      (data as any[]).forEach(row => {
        if (!map[row.contato_id]) map[row.contato_id] = [];
        map[row.contato_id].push(row.etiqueta_id);
      });
      setContatoEtiquetas(map);
    }
  }, []);

  const fetchMensagensRapidas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('whatsapp_mensagens_rapidas')
      .select('*')
      .eq('user_id', user.id)
      .order('ordem', { ascending: true });
    setMensagensRapidas((data as MensagemRapida[]) ?? []);
  }, [user]);

  useEffect(() => { fetchEtiquetas(); fetchContatoEtiquetas(); fetchMensagensRapidas(); }, [fetchEtiquetas, fetchContatoEtiquetas, fetchMensagensRapidas]);

  const handleEtiquetaToggle = (contatoId: string, etiquetaId: string, ativo: boolean) => {
    setContatoEtiquetas(prev => {
      const ids = prev[contatoId] || [];
      if (ativo) return { ...prev, [contatoId]: [...ids, etiquetaId] };
      return { ...prev, [contatoId]: ids.filter(id => id !== etiquetaId) };
    });
  };

  const fetchContatos = useCallback(async () => {
    const instanciaIds = instancias.map(instancia => instancia.id);

    if (instanciaIds.length === 0) {
      setContatos([]);
      setArquivadosCount(0);
      return;
    }

    let query = supabase
      .from('whatsapp_contatos')
      .select(`
        id,
        instancia_id,
        telefone,
        nome,
        ultima_mensagem,
        ultima_mensagem_em,
        nao_lido,
        fixado,
        arquivado,
        user_whatsapp_instances(nome)
      `)
      .order('ultima_mensagem_em', { ascending: false });

    if (filtroInstancia !== 'todas' && instanciaIds.includes(filtroInstancia)) {
      query = query.eq('instancia_id', filtroInstancia);
    } else {
      query = query.in('instancia_id', instanciaIds);
    }

    // Filtra por aba (Conversas mostra não arquivados; Arquivados mostra arquivados)
    query = query.eq('arquivado', abaAtiva === 'arquivados');

    const { data } = await query;

    // Sufixos (últimos 8 dígitos) dos telefones das próprias instâncias —
    // usados para detectar conversas internas (entre meus próprios WhatsApps)
    const sufixosInternos = new Set(
      (instancias as any[])
        .map(i => (i.telefone || '').replace(/\D/g, '').slice(-8))
        .filter(s => s.length === 8)
    );
    const isContatoInterno = (telefone: string | null | undefined) => {
      const suf = (telefone || '').replace(/\D/g, '').slice(-8);
      return suf.length === 8 && sufixosInternos.has(suf);
    };

    if (data) {
      const contatosComNomeInstancia = (data as any[])
        .map((contato) => ({
          ...contato,
          instancia_nome: contato.user_whatsapp_instances?.nome ?? null,
        }))
        // Aba "Conversas": esconde internos. Aba "Arquivados": mostra os internos também.
        .filter((contato) => {
          const interno = isContatoInterno(contato.telefone);
          return abaAtiva === 'arquivados' ? true : !interno;
        });
      setContatos(contatosComNomeInstancia as Contato[]);
    }

    // Conta total de arquivados (escopo das instâncias visíveis) para o badge da aba.
    // Inclui tanto arquivados manuais quanto conversas internas.
    let countQuery = supabase
      .from('whatsapp_contatos')
      .select('id, telefone', { count: 'exact' })
      .eq('arquivado', true);
    if (filtroInstancia !== 'todas' && instanciaIds.includes(filtroInstancia)) {
      countQuery = countQuery.eq('instancia_id', filtroInstancia);
    } else {
      countQuery = countQuery.in('instancia_id', instanciaIds);
    }
    const { count: countArquivadosManuais } = await countQuery;

    // Conta também os contatos internos não arquivados manualmente
    let internosQuery = supabase
      .from('whatsapp_contatos')
      .select('telefone')
      .eq('arquivado', false);
    if (filtroInstancia !== 'todas' && instanciaIds.includes(filtroInstancia)) {
      internosQuery = internosQuery.eq('instancia_id', filtroInstancia);
    } else {
      internosQuery = internosQuery.in('instancia_id', instanciaIds);
    }
    const { data: candidatosInternos } = await internosQuery;
    const internosCount = (candidatosInternos || []).filter(c => isContatoInterno((c as any).telefone)).length;

    setArquivadosCount((countArquivadosManuais ?? 0) + internosCount);
  }, [filtroInstancia, instancias, abaAtiva]);

  useEffect(() => { fetchContatos(); }, [fetchContatos]);

  useEffect(() => {
    if (filtroInstancia === 'todas') return;
    if (instancias.some(instancia => instancia.id === filtroInstancia)) return;
    setFiltroInstancia('todas');
  }, [filtroInstancia, instancias]);

  useEffect(() => {
    if (!contatoAtivo) return;
    if (instancias.some(instancia => instancia.id === contatoAtivo.instancia_id)) return;
    setContatoAtivo(null);
    setMensagens([]);
  }, [contatoAtivo, instancias]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-contatos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contatos' }, () => {
        fetchContatos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchContatos]);

  const fetchMensagens = useCallback(async (loadMore = false) => {
    if (!contatoAtivo) return;
    if (loadMore) {
      setCarregandoAnteriores(true);
    } else {
      setCarregandoMensagens(true);
    }

    // For initial load, get most recent messages; for load-more, get older ones
    const offset = loadMore ? (paginaAtual + 1) * PAGE_SIZE : 0;
    
    const phoneSuffix = contatoAtivo.telefone.replace(/^55/, '').slice(-8);
    const { data, count } = await supabase
      .from('whatsapp_mensagens')
      .select('*', { count: 'exact' })
      .eq('instancia_id', contatoAtivo.instancia_id)
      .ilike('telefone_remoto', `%${phoneSuffix}`)
      .order('timestamp_msg', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (data) {
      const newMessages = (data as Mensagem[]).reverse(); // back to ascending order
      
      if (loadMore) {
        // Prepend older messages
        setMensagens(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const unique = newMessages.filter(m => !existingIds.has(m.id));
          return [...unique, ...prev];
        });
        setPaginaAtual(p => p + 1);
        setTemMaisAnteriores(newMessages.length === PAGE_SIZE);
      } else {
        setMensagens(prev => {
          const persistedMessages = newMessages;
          const persistedKeys = new Set(persistedMessages.map(getMessageIdentity));
          const unresolvedTempMessages = prev.filter(
            msg => msg.id.startsWith('temp-') && !persistedKeys.has(getMessageIdentity(msg))
          );
          return [...persistedMessages, ...unresolvedTempMessages].sort(
            (a, b) => new Date(a.timestamp_msg).getTime() - new Date(b.timestamp_msg).getTime()
          );
        });
        // Check if there are more messages beyond the first page
        setTemMaisAnteriores((count || 0) > PAGE_SIZE);
      }
    }
    
    if (loadMore) {
      setCarregandoAnteriores(false);
    } else {
      setCarregandoMensagens(false);
    }
  }, [contatoAtivo, paginaAtual]);

  useEffect(() => { fetchMensagens(); }, [fetchMensagens]);

  const fetchHistorico = useCallback(async () => {
    if (!contatoAtivo || carregandoHistorico) return;
    const instancia = instancias.find(i => i.id === contatoAtivo.instancia_id);
    if (!instancia) return;
    setCarregandoHistorico(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-whatsapp-history', {
        body: {
          server_url: instancia.server_url,
          instance_token: instancia.instance_token,
          instancia_id: instancia.id,
          telefone: contatoAtivo.telefone,
        },
      });
      if (error) throw error;
      
      if (data?.imported > 0) {
        await fetchMensagens();
        toast({ title: 'Histórico importado', description: `${data.imported} mensagens importadas com sucesso` });
      } else if (data?.api_supported === false) {
        toast({ 
          title: 'Histórico indisponível', 
          description: 'Esta instância não suporta recuperação de histórico antigo. As mensagens salvas desde a conexão estão disponíveis ao rolar para cima.',
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Histórico completo', description: 'Todas as mensagens já estão carregadas. Role para cima para ver mensagens anteriores.' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao buscar histórico', description: 'Falha na comunicação com a API. Tente novamente.', variant: 'destructive' });
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setCarregandoHistorico(false);
    }
  }, [contatoAtivo, instancias, carregandoHistorico, fetchMensagens, toast]);

  useEffect(() => {
    if (!contatoAtivo) return;
    const channel = supabase
      .channel('whatsapp-mensagens-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens' }, (payload) => {
        const newMsg = payload.new as Mensagem;
        const suffix = contatoAtivo.telefone.replace(/^55/, '').slice(-8);
        if (newMsg.instancia_id === contatoAtivo.instancia_id &&
            newMsg.telefone_remoto.endsWith(suffix)) {
          setMensagens(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const newIdentity = getMessageIdentity(newMsg);
            const filtered = prev.filter(
              msg => !(msg.id.startsWith('temp-') && getMessageIdentity(msg) === newIdentity)
            );
            return [...filtered, newMsg].sort(
              (a, b) => new Date(a.timestamp_msg).getTime() - new Date(b.timestamp_msg).getTime()
            );
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [contatoAtivo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.length]);

  // Infinite scroll: load older messages when scrolling near the top
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || !contatoAtivo) return;

    const handleScroll = () => {
      if (container.scrollTop < 120 && temMaisAnteriores && !carregandoAnteriores && !carregandoMensagens) {
        const oldScrollHeight = container.scrollHeight;
        fetchMensagens(true).then(() => {
          requestAnimationFrame(() => {
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight - oldScrollHeight;
            }
          });
        });
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [contatoAtivo, temMaisAnteriores, carregandoAnteriores, carregandoMensagens, fetchMensagens]);

  useEffect(() => {
    if (!contatoAtivo || contatoAtivo.nao_lido === 0) return;
    // Immediately update local state so badge and list reflect read status
    const id = contatoAtivo.id;
    setContatoAtivo(prev => prev && prev.id === id ? { ...prev, nao_lido: 0 } : prev);
    setContatos(prev => prev.map(c => c.id === id ? { ...c, nao_lido: 0 } : c));
    
    const markRead = async () => {
      await supabase.from('whatsapp_contatos').update({ nao_lido: 0 }).eq('id', id);
      const readSuffix = contatoAtivo.telefone.replace(/^55/, '').slice(-8);
      await supabase.from('whatsapp_mensagens').update({ lida: true })
        .eq('instancia_id', contatoAtivo.instancia_id)
        .ilike('telefone_remoto', `%${readSuffix}`)
        .eq('lida', false);
    };
    markRead();
  }, [contatoAtivo]);

  const hasPendingMessages = enviando || inputBusy || mensagens.some(m => m.id.startsWith('temp-'));

  const handleSelectContato = (contato: Contato) => {
    if (hasPendingMessages) {
      toast({ title: 'Aguarde', description: 'Aguardando confirmação do envio da mensagem...', variant: 'default' });
      return;
    }
    setContatoAtivo(contato);
    setMensagens([]);
    setPaginaAtual(0);
    setTemMaisAnteriores(true);
  };

  const handleEnviarTexto = async (texto: string) => {
    if (!contatoAtivo || enviando) return;
    const instancia = instancias.find(i => i.id === contatoAtivo.instancia_id);
    if (!instancia) {
      toast({ title: 'Erro', description: 'Instância não encontrada', variant: 'destructive' });
      return;
    }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          telefone: contatoAtivo.telefone,
          mensagem: texto,
          uazapi_server_url: instancia.server_url,
          uazapi_instance_token: instancia.instance_token,
          instancia_id: instancia.id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar');

      const msgOtimista: Mensagem = {
        id: `temp-${Date.now()}`,
        instancia_id: contatoAtivo.instancia_id,
        telefone_remoto: contatoAtivo.telefone,
        nome_contato: null,
        conteudo: texto,
        direcao: 'saida',
        timestamp_msg: new Date().toISOString(),
        lida: true,
      };
      setMensagens(prev => [...prev, msgOtimista]);
      setTimeout(() => fetchMensagens(), 1500);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  const handleMediaSent = useCallback((payload?: MediaSentPayload) => {
    if (payload && contatoAtivo) {
      const msgOtimista: Mensagem = {
        id: `temp-${Date.now()}`,
        instancia_id: contatoAtivo.instancia_id,
        telefone_remoto: contatoAtivo.telefone,
        nome_contato: contatoAtivo.nome,
        conteudo: payload.conteudo,
        direcao: 'saida',
        timestamp_msg: new Date().toISOString(),
        lida: true,
        tipo_conteudo: payload.tipo_conteudo,
        media_url: payload.media_url,
      };
      setMensagens(prev => [...prev, msgOtimista]);
    }

    setTimeout(() => fetchMensagens(), 1500);
  }, [contatoAtivo, fetchMensagens]);

  const contatosFiltrados = contatos
    .filter(c => {
      if (busca) {
        const term = busca.toLowerCase();
        if (!(c.nome?.toLowerCase().includes(term) || c.telefone.includes(term))) return false;
      }
      if (filtroEtiqueta) {
        const ids = contatoEtiquetas[c.id] || [];
        if (!ids.includes(filtroEtiqueta)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aFixado = a.fixado ? 1 : 0;
      const bFixado = b.fixado ? 1 : 0;
      if (aFixado !== bFixado) return bFixado - aFixado;
      if (a.nao_lido > 0 && b.nao_lido === 0) return -1;
      if (a.nao_lido === 0 && b.nao_lido > 0) return 1;
      return new Date(b.ultima_mensagem_em || 0).getTime() - new Date(a.ultima_mensagem_em || 0).getTime();
    });

  const isCertificadora = (nome: string | null | undefined) =>
    nome?.toUpperCase().includes('CERTIFICADORA') ?? false;

  const getInstanciaNome = (instanciaId: string, instanciaNomeContato?: string | null) => {
    if (instanciaNomeContato) return instanciaNomeContato;
    const inst = instancias.find(i => i.id === instanciaId);
    return inst?.nome || null;
  };

  const formatTelefone = (tel: string) => {
    if (tel.length === 13) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 9)}-${tel.slice(9)}`;
    if (tel.length === 12) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 8)}-${tel.slice(8)}`;
    return tel;
  };

  const formatMsgTime = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
      if (diffDays === 0) return format(date, 'HH:mm');
      if (diffDays === 1) return 'Ontem';
      if (diffDays < 7) return format(date, 'EEEE', { locale: ptBR });
      return format(date, 'dd/MM/yy');
    } catch { return ''; }
  };

  const activeInstancia = contatoAtivo
    ? instancias.find(i => i.id === contatoAtivo.instancia_id)
    : null;

  const handleApagarParaMim = async (msgId: string) => {
    await supabase.from('whatsapp_mensagens').delete().eq('id', msgId);
    setMensagens(prev => prev.filter(m => m.id !== msgId));
    toast({ title: 'Mensagem apagada' });
  };

  const handleApagarParaTodos = async (msgId: string) => {
    const msg = mensagens.find(m => m.id === msgId);
    if (!msg) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-whatsapp-message', {
        body: { mensagem_id: msgId },
      });
      if (error) throw error;
      setMensagens(prev => prev.filter(m => m.id !== msgId));
      if (data?.deleted_on_whatsapp) {
        toast({ title: 'Mensagem apagada para todos' });
      } else if (!data?.had_whatsapp_id) {
        toast({ title: 'Mensagem removida', description: 'Não foi possível apagar no WhatsApp (ID da mensagem não disponível)' });
      } else {
        toast({ title: 'Mensagem removida do sistema', description: 'Não foi possível apagar no WhatsApp' });
      }
    } catch (err) {
      console.error('Erro ao apagar mensagem:', err);
      toast({ title: 'Erro ao apagar mensagem', variant: 'destructive' });
    }
  };

  const handleEditarMensagem = (msgId: string, conteudoAtual: string) => {
    setEditandoMsg({ id: msgId, conteudo: conteudoAtual });
    setEditTexto(conteudoAtual);
  };

  const handleSalvarEdicao = async () => {
    if (!editandoMsg || !editTexto.trim()) return;
    await supabase
      .from('whatsapp_mensagens')
      .update({ conteudo: editTexto.trim() } as any)
      .eq('id', editandoMsg.id);
    setMensagens(prev =>
      prev.map(m => m.id === editandoMsg.id ? { ...m, conteudo: editTexto.trim() } : m)
    );
    setEditandoMsg(null);
    setEditTexto('');
    toast({ title: 'Mensagem editada' });
  };

  const handleFixarToggle = async (contatoId: string, fixado: boolean) => {
    await supabase.from('whatsapp_contatos').update({ fixado } as any).eq('id', contatoId);
    setContatos(prev => prev.map(c => c.id === contatoId ? { ...c, fixado } : c));
  };

  const handleArquivarToggle = async (contatoId: string, arquivado: boolean) => {
    const { error } = await supabase
      .from('whatsapp_contatos')
      .update({ arquivado } as any)
      .eq('id', contatoId);
    if (error) {
      toast({ title: 'Erro ao arquivar', description: error.message, variant: 'destructive' });
      return;
    }
    // Remove da lista atual (sai do escopo da aba aberta) e atualiza contadores
    setContatos(prev => prev.filter(c => c.id !== contatoId));
    setArquivadosCount(prev => arquivado ? prev + 1 : Math.max(0, prev - 1));
    if (contatoAtivo?.id === contatoId) {
      setContatoAtivo(null);
      setMensagens([]);
    }
    toast({ title: arquivado ? 'Conversa arquivada' : 'Conversa desarquivada' });
  };

  const handleExcluirConversa = async (contatoId: string) => {
    const contato = contatos.find(c => c.id === contatoId);
    if (!contato) return;

    // Delete messages first, then the contact
    await supabase
      .from('whatsapp_mensagens')
      .delete()
      .eq('instancia_id', contato.instancia_id)
      .eq('telefone_remoto', contato.telefone);

    await supabase
      .from('whatsapp_contato_etiquetas')
      .delete()
      .eq('contato_id', contatoId);

    await supabase
      .from('whatsapp_contatos')
      .delete()
      .eq('id', contatoId);

    setContatos(prev => prev.filter(c => c.id !== contatoId));
    if (contatoAtivo?.id === contatoId) {
      setContatoAtivo(null);
      setMensagens([]);
    }
    toast({ title: 'Conversa excluída' });
  };

  const handleNovaConversa = async () => {
    if (!novoTelefone || !novaInstanciaId || !novaMensagem.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    const instancia = instancias.find(i => i.id === novaInstanciaId);
    if (!instancia) return;

    const telefoneFormatado = novoTelefone.replace(/\D/g, '');
    const telefoneCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;

    setEnviandoNova(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          telefone: telefoneCompleto,
          mensagem: novaMensagem.trim(),
          uazapi_server_url: instancia.server_url,
          uazapi_instance_token: instancia.instance_token,
          instancia_id: instancia.id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar');

      toast({ title: 'Mensagem enviada', description: 'Conversa iniciada com sucesso' });
      setNovaConversaOpen(false);
      setNovoTelefone('');
      setNovaMensagem('');
      setNovaInstanciaId('');

      // Wait for realtime to create contact, then try to select it
      setTimeout(async () => {
        await fetchContatos();
        const { data: contatoData } = await supabase
          .from('whatsapp_contatos')
          .select('id, instancia_id, telefone, nome, ultima_mensagem, ultima_mensagem_em, nao_lido, fixado')
          .eq('instancia_id', instancia.id)
          .eq('telefone', telefoneCompleto)
          .maybeSingle();
        if (contatoData) {
          handleSelectContato(contatoData as Contato);
        }
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setEnviandoNova(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-5rem)] lg:h-[calc(100vh-2rem)] rounded-lg overflow-hidden border border-border bg-card">
        <div className={cn(
          'w-full md:w-80 lg:w-96 md:min-w-[20rem] lg:min-w-[24rem] md:max-w-[20rem] lg:max-w-[24rem] shrink-0 border-r border-border flex flex-col bg-card overflow-hidden',
          contatoAtivo ? 'hidden md:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground flex-1">WhatsApp Inbox</h2>
              <Popover open={etiquetaFilterOpen} onOpenChange={setEtiquetaFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 rounded-full",
                      filtroEtiqueta
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-primary/10 hover:bg-primary/20 text-primary"
                    )}
                    title="Filtrar por etiqueta"
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="end">
                  <div className="space-y-0.5">
                    {etiquetas.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 text-center">Nenhuma etiqueta criada</p>
                    ) : (
                      etiquetas.map(et => (
                        <button
                          key={et.id}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                            filtroEtiqueta === et.id && "bg-accent"
                          )}
                          onClick={() => {
                            setFiltroEtiqueta(filtroEtiqueta === et.id ? null : et.id);
                            setEtiquetaFilterOpen(false);
                          }}
                        >
                          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: et.cor }} />
                          <span className="flex-1 truncate text-left">{et.nome}</span>
                          {filtroEtiqueta === et.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      ))
                    )}
                    {filtroEtiqueta && (
                      <>
                        <div className="border-t border-border my-1" />
                        <button
                          className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-muted-foreground transition-colors"
                          onClick={() => { setFiltroEtiqueta(null); setEtiquetaFilterOpen(false); }}
                        >
                          <X className="h-3 w-3" />
                          Limpar filtro
                        </button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
                onClick={() => setMensagensRapidasOpen(true)}
                title="Mensagens rápidas"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
                onClick={() => setNovaConversaOpen(true)}
                title="Nova conversa"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar contato..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            {instancias.length > 1 && (
              <Select value={filtroInstancia} onValueChange={setFiltroInstancia}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas as instâncias" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as instâncias</SelectItem>
                  {instancias.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.nome || 'Instância'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as 'conversas' | 'arquivados')}>
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="conversas" className="text-xs">Conversas</TabsTrigger>
                <TabsTrigger value="arquivados" className="text-xs flex items-center gap-1">
                  <Archive className="h-3 w-3" />
                  Arquivados
                  {arquivadosCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 min-w-[18px] px-1 text-[10px]">
                      {arquivadosCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
            {contatosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma conversa ainda</p>
                <p className="text-xs mt-1">As mensagens aparecerão aqui quando chegarem</p>
              </div>
            ) : (
              contatosFiltrados.map(contato => {
                const etIds = contatoEtiquetas[contato.id] || [];
                const etBadges = etiquetas.filter(e => etIds.includes(e.id));
                return (
                  <ConversaContextMenu
                    key={contato.id}
                    contatoId={contato.id}
                    etiquetas={etiquetas}
                    contatoEtiquetaIds={etIds}
                    fixado={!!contato.fixado}
                    arquivado={!!contato.arquivado}
                    onMarcarNaoLida={fetchContatos}
                    onEtiquetaToggle={handleEtiquetaToggle}
                    onEtiquetasChange={() => { fetchEtiquetas(); fetchContatoEtiquetas(); }}
                    onFixarToggle={handleFixarToggle}
                    onArquivarToggle={handleArquivarToggle}
                    onExcluirConversa={handleExcluirConversa}
                  >
                    <button
                      onClick={() => handleSelectContato(contato)}
                      className={cn(
                        'w-full flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors text-left border-b border-border/50 overflow-hidden',
                        contatoAtivo?.id === contato.id && 'bg-accent'
                      )}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-foreground truncate block min-w-0 flex-1">
                            {contato.nome || formatTelefone(contato.telefone)}
                          </span>
                          {contato.fixado && <Pin className="h-3 w-3 text-muted-foreground shrink-0 rotate-45" />}
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                            {contato.ultima_mensagem_em && formatMsgTime(contato.ultima_mensagem_em)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate block min-w-0 flex-1">
                            {contato.ultima_mensagem || 'Sem mensagens'}
                          </p>
                          {contato.nao_lido > 0 && (
                            <Badge className="h-5 min-w-[20px] text-xs bg-primary text-primary-foreground shrink-0">
                              {contato.nao_lido}
                            </Badge>
                          )}
                        </div>
                        {etBadges.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {etBadges.map(et => (
                              <span
                                key={et.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white leading-none"
                                style={{ backgroundColor: et.cor }}
                              >
                                {et.nome}
                              </span>
                            ))}
                          </div>
                        )}
                        {getInstanciaNome(contato.instancia_id, contato.instancia_nome) && (
                          <span className={cn(
                            "text-[10px] mt-0.5 block truncate",
                            isCertificadora(getInstanciaNome(contato.instancia_id, contato.instancia_nome))
                              ? "text-amber-500 font-semibold"
                              : "text-muted-foreground/60"
                          )}>
                            {getInstanciaNome(contato.instancia_id, contato.instancia_nome)}
                          </span>
                        )}
                      </div>
                    </button>
                  </ConversaContextMenu>
                );
              })
            )}

          </ScrollArea>
        </div>

        <div className={cn('flex-1 min-w-0 flex flex-col', !contatoAtivo ? 'hidden md:flex' : 'flex')}>
          {!contatoAtivo ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg">Selecione uma conversa</p>
                <p className="text-sm mt-1">Escolha um contato para ver as mensagens</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center gap-3 bg-card">
                <button className="md:hidden text-muted-foreground" onClick={() => setContatoAtivo(null)}>
                  <ArrowDown className="h-5 w-5 rotate-90" />
                </button>
                <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {contatoAtivo.nome || formatTelefone(contatoAtivo.telefone)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTelefone(contatoAtivo.telefone)}
                    {getInstanciaNome(contatoAtivo.instancia_id, contatoAtivo.instancia_nome) && (
                      <>
                        {' · '}
                        <span className={isCertificadora(getInstanciaNome(contatoAtivo.instancia_id, contatoAtivo.instancia_nome)) ? "text-amber-500 font-semibold" : ""}>
                          {getInstanciaNome(contatoAtivo.instancia_id, contatoAtivo.instancia_nome)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => fetchHistorico()}
                  disabled={carregandoHistorico}
                  title="Carregar histórico de mensagens"
                >
                  {carregandoHistorico ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <History className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-2 bg-background/50 relative"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) setDroppedFile(file);
                }}
              >
                {dragOver && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg">
                    <div className="flex flex-col items-center gap-2 text-primary">
                      <Upload className="h-10 w-10" />
                      <span className="font-medium text-sm">Solte o arquivo aqui</span>
                    </div>
                  </div>
                )}
                {carregandoMensagens ? (
                  <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
                ) : mensagens.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem</div>
                ) : (
                  <>
                    {temMaisAnteriores && (
                      <div className="text-center py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchMensagens(true)}
                          disabled={carregandoAnteriores}
                          className="text-xs text-muted-foreground"
                        >
                          {carregandoAnteriores ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Carregando...</>
                          ) : (
                            'Carregar mensagens anteriores'
                          )}
                        </Button>
                      </div>
                    )}
                    {mensagens.map((msg, idx) => {
                      const msgDate = new Date(msg.timestamp_msg);
                      const msgDateStr = msgDate.toLocaleDateString('pt-BR');
                      const prevMsg = idx > 0 ? mensagens[idx - 1] : null;
                      const prevDateStr = prevMsg ? new Date(prevMsg.timestamp_msg).toLocaleDateString('pt-BR') : null;
                      const showDateSep = !prevMsg || msgDateStr !== prevDateStr;

                      let dateLabel = msgDateStr;
                      const hoje = new Date();
                      const ontem = new Date();
                      ontem.setDate(ontem.getDate() - 1);
                      if (msgDateStr === hoje.toLocaleDateString('pt-BR')) dateLabel = 'HOJE';
                      else if (msgDateStr === ontem.toLocaleDateString('pt-BR')) dateLabel = 'ONTEM';

                      return (
                        <div key={msg.id}>
                          {showDateSep && (
                            <div className="flex justify-center my-3">
                              <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-md shadow-sm">
                                {dateLabel}
                              </span>
                            </div>
                          )}
                          <ChatMessage
                            msg={msg}
                            formatMsgTime={formatMsgTime}
                            onApagarParaMim={handleApagarParaMim}
                            onApagarParaTodos={handleApagarParaTodos}
                            onEditar={handleEditarMensagem}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {activeInstancia && (
                <ChatInputBar
                  instanciaId={activeInstancia.id}
                  telefone={contatoAtivo.telefone}
                  serverUrl={activeInstancia.server_url}
                  instanceToken={activeInstancia.instance_token}
                  onTextSent={handleEnviarTexto}
                  onMediaSent={handleMediaSent}
                  enviando={enviando}
                  externalFile={droppedFile}
                  onExternalFileHandled={() => setDroppedFile(null)}
                  mensagensRapidas={mensagensRapidas.filter(m => !m.arquivado)}
                  onBusyChange={setInputBusy}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={novaConversaOpen} onOpenChange={setNovaConversaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                placeholder="5511999999999"
                value={novoTelefone}
                onChange={e => setNovoTelefone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Inclua o código do país (55 para Brasil)</p>
            </div>
            <div className="space-y-2">
              <Label>Instância</Label>
              <Popover open={instanciaComboOpen} onOpenChange={setInstanciaComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={instanciaComboOpen} className="w-full justify-between font-normal">
                    {novaInstanciaId
                      ? (instancias.find(i => i.id === novaInstanciaId)?.nome || 'Instância')
                      : 'Selecione uma instância'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar instância..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma instância encontrada.</CommandEmpty>
                      <CommandGroup>
                        {instancias.map(inst => (
                          <CommandItem
                            key={inst.id}
                            value={inst.nome || inst.id}
                            onSelect={() => {
                              setNovaInstanciaId(inst.id);
                              setInstanciaComboOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", novaInstanciaId === inst.id ? "opacity-100" : "opacity-0")} />
                            {inst.nome || 'Instância'}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite a primeira mensagem..."
                value={novaMensagem}
                onChange={e => setNovaMensagem(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              onClick={handleNovaConversa}
              disabled={enviandoNova || !novoTelefone || !novaInstanciaId || !novaMensagem.trim()}
              className="w-full"
            >
              {enviandoNova ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</> : 'Iniciar conversa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editandoMsg !== null} onOpenChange={(open) => !open && setEditandoMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editar mensagem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={editTexto}
              onChange={(e) => setEditTexto(e.target.value)}
              rows={4}
              className="resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditandoMsg(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSalvarEdicao} disabled={!editTexto.trim()}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {user && (
        <MensagensRapidasDialog
          open={mensagensRapidasOpen}
          onOpenChange={setMensagensRapidasOpen}
          userId={user.id}
          onUpdated={fetchMensagensRapidas}
        />
      )}
    </AppLayout>
  );
}
