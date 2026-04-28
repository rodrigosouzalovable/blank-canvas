import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, AlertCircle, Check, History, RotateCcw, Phone, XCircle, Maximize2, Play, Loader2, Ban, RefreshCw, Clock, Send, CheckCircle, MessageSquare, Volume2, Square } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useWhatsAppSending } from '@/contexts/WhatsAppSendingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppInstance {
  id: string;
  nome: string | null;
  server_url: string;
  instance_token: string;
  ativo: boolean;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function WhatsAppStatusBadge({ status }: { status: string }) {
  if (status === 'enviado') return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs px-1.5 py-0">Enviado</Badge>;
  if (status === 'erro') return <Badge variant="destructive" className="text-xs px-1.5 py-0">Erro</Badge>;
  if (status === 'enviando') return <Badge className="bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0 gap-1"><RefreshCw className="h-2.5 w-2.5 animate-spin" />Enviando</Badge>;
  if (status === 'pendente') return <Badge className="bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0">Pendente</Badge>;
  return <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1 text-muted-foreground"><Ban className="h-2.5 w-2.5" />Aguardando</Badge>;
}

interface LembreteTemplate {
  tipo_lembrete: string;
  mensagem: string;
  audio_url?: string | null;
  botoes_texto?: string | null;
  botoes_choices?: string[] | null;
}

export function PaymentReminders() {
  const { lembretesVencidos, lembretesHoje, lembretesTresDias, lembretesJaLidos, temLembretes, isLoading, marcarComoLido, desmarcarLido } = usePaymentReminders();
  const { user } = useAuth();
  const { acordosCompartilhados, concedidoPor } = useUserPermissions();
  const { isSending, currentSendingId, statusMap, envioProgresso, startSending, cancelSending, loadSavedProgress, markAsEnviado, sendSingleMessage } = useWhatsAppSending();
  const [activeTab, setActiveTab] = useState('pendentes');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [tipoEnvio, setTipoEnvio] = useState<'texto' | 'audio' | 'audio_botoes'>('texto');

  // WhatsApp instances
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('lembretes-selected-instances');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const roundRobinRef = useRef(0);

  // Templates & operator
  const [templates, setTemplates] = useState<LembreteTemplate[]>([]);
  const [operadorNome, setOperadorNome] = useState('');

  // Fila items for status checking from DB
  const [filaItems, setFilaItems] = useState<{ id: string; pagamento_id: string; telefone: string; status: string | null }[]>([]);

  const selectedInstances = instances.filter(i => selectedInstanceIds.includes(i.id));

  const toggleInstance = (id: string) => {
    setSelectedInstanceIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('lembretes-selected-instances', JSON.stringify(next));
      return next;
    });
  };

  const totalLembretes = lembretesVencidos.length + lembretesHoje.length + lembretesTresDias.length;
  const allPendingReminders = [...lembretesHoje, ...lembretesVencidos, ...lembretesTresDias];

  // Fetch instances, templates, operator name when dialog opens
  useEffect(() => {
    if (!dialogOpen || !user) return;
    const adminId = acordosCompartilhados && concedidoPor ? concedidoPor : null;
    const fetchUserIds = adminId ? [user.id, adminId] : [user.id];
    (async () => {
      const [instRes, tplRes, profileRes] = await Promise.all([
        supabase
          .from('user_whatsapp_instances')
          .select('id, nome, server_url, instance_token, ativo')
          .in('user_id', fetchUserIds)
          .eq('ativo', true),
        supabase
          .from('lembrete_mensagens_templates')
          .select('tipo_lembrete, mensagem, audio_url, botoes_texto, botoes_choices')
          .eq('user_id', user.id)
          .eq('ativo', true),
        supabase
          .from('profiles')
          .select('nome')
          .eq('id', user.id)
          .single(),
      ]);
      if (instRes.data) {
        setInstances(instRes.data);
        const activeIds = new Set(instRes.data.map((i: any) => i.id));
        setSelectedInstanceIds(prev => {
          const filtered = prev.filter(id => activeIds.has(id));
          localStorage.setItem('lembretes-selected-instances', JSON.stringify(filtered));
          if (instRes.data.length === 1) return [instRes.data[0].id];
          return filtered;
        });
      }
      if (tplRes.data) setTemplates(tplRes.data.map((t: any) => ({
        ...t,
        botoes_choices: Array.isArray(t.botoes_choices) ? t.botoes_choices as string[] : null,
      })));
      if (profileRes.data) {
        const primeiro = profileRes.data.nome?.split(' ')[0] || '';
        setOperadorNome(primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase());
      }
      // Also reload saved progress
      loadSavedProgress();
    })();
  }, [dialogOpen, user]);

  // Fetch fila items
  const fetchFila = useCallback(async () => {
    if (selectedInstances.length === 0) { setFilaItems([]); return; }
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const tokens = selectedInstances.map(i => i.instance_token);
    const { data } = await supabase
      .from('whatsapp_fila')
      .select('id, pagamento_id, telefone, status')
      .in('instance_token', tokens)
      .gte('criado_em', `${hojeStr}T00:00:00`)
      .lte('criado_em', `${hojeStr}T23:59:59`);
    setFilaItems(data || []);
  }, [selectedInstances.map(i => i.id).join(',')]);

  useEffect(() => { if (dialogOpen) fetchFila(); }, [dialogOpen, fetchFila]);

  // Get WhatsApp status for a reminder - check context statusMap first, then DB fila, then saved progress
  const getWhatsAppStatus = (reminderId: string, telefone?: string): string => {
    if (reminderId === currentSendingId) return 'enviando';
    if (statusMap[reminderId]) return statusMap[reminderId];

    // Check saved progress from DB
    const savedItem = envioProgresso.find(p => p.pagamento_id === reminderId);
    if (savedItem) {
      if (savedItem.status === 'enviado') return 'enviado';
      if (savedItem.status === 'erro') return 'erro';
      return 'pendente';
    }

    // Check fila items
    const rPhone = normalizePhone(telefone || '');
    const match = filaItems.find(f => {
      if (f.pagamento_id === reminderId) return true;
      const fPhone = normalizePhone(f.telefone);
      return rPhone.length > 0 && (rPhone === fPhone || `55${rPhone}` === fPhone || rPhone === `55${fPhone}`);
    });
    if (match) {
      if (match.status === 'enviado') return 'enviado';
      if (match.status === 'erro') return 'erro';
      return 'pendente';
    }
    return 'nao_enviado';
  };

  // Compute progress
  const enviadosCount = allPendingReminders.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'enviado').length;
  const errosCount = allPendingReminders.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'erro').length;
  const enviadosHoje = lembretesHoje.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'enviado').length;
  const enviadosVencidos = lembretesVencidos.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'enviado').length;
  const enviadosTresDias = lembretesTresDias.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'enviado').length;
  const naoEnviadosCount = allPendingReminders.filter(r => getWhatsAppStatus(r.id, r.cliente_telefone) === 'nao_enviado').length;
  const progressPercent = allPendingReminders.length > 0 ? Math.round(((enviadosCount + errosCount) / allPendingReminders.length) * 100) : 0;

  // Get last sent time from saved progress
  const ultimoEnvio = envioProgresso
    .filter(p => p.status === 'enviado' && p.enviado_em)
    .sort((a, b) => new Date(b.enviado_em!).getTime() - new Date(a.enviado_em!).getTime())[0];

  const handleStartEnvios = async () => {
    if (selectedInstances.length === 0 || !user) return;

    const pendentes = allPendingReminders.filter(r => {
      if (!r.cliente_telefone) return false;
      const status = getWhatsAppStatus(r.id, r.cliente_telefone);
      return status === 'nao_enviado';
    });

    if (pendentes.length === 0) {
      toast.info('Nenhum lembrete pendente para enviar.');
      return;
    }

    const queueItems = pendentes.map(r => ({
      id: r.id,
      cliente_nome: r.cliente_nome,
      cliente_telefone: r.cliente_telefone!,
      valor_parcela: r.valor_parcela,
      data_prevista: r.data_prevista,
      tipo: r.tipo,
      acordo_id: r.acordo_id,
    }));

    startSending(queueItems, selectedInstances, templates, operadorNome, {
      minDelayMin: minDelay,
      maxDelayMin: maxDelay,
      tipoEnvio,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleMarcarLido = (e: React.MouseEvent, lembreteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    marcarComoLido(lembreteId);
  };

  const handleDesmarcarLido = (e: React.MouseEvent, lembreteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    desmarcarLido(lembreteId);
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  const renderLembreteItem = (lembrete: any, bgClass: string, hoverClass: string, inDialog = false) => {
    const isPagamento = lembrete.categoria === 'pagamento';
    const linkTo = isPagamento ? `/acordos/${lembrete.acordo_id}` : '/retornos';
    const whatsappStatus = inDialog ? getWhatsAppStatus(lembrete.id, lembrete.cliente_telefone) : '';

    return (
      <div
        key={lembrete.id}
        className={`flex items-center gap-2 p-2 rounded-lg ${bgClass} ${hoverClass} transition-colors`}
      >
        <Link
          to={linkTo}
          className="flex items-center justify-between flex-1 min-w-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {!isPagamento && <Phone className="h-3 w-3 text-primary shrink-0" />}
              <span className="font-medium text-foreground text-sm truncate flex items-center gap-1">
                {lembrete.cliente_nome}
                <CopyButton value={lembrete.cliente_nome} label="Nome" preserveText />
              </span>
            </div>
            {lembrete.cliente_telefone ? (
              <span className="text-muted-foreground text-xs flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                {lembrete.cliente_telefone}
                <CopyButton value={lembrete.cliente_telefone} label="Telefone" />
                {inDialog && lembrete.data_prevista && (
                  <span className="ml-1 text-muted-foreground">
                    • {new Date(lembrete.data_prevista + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs flex items-center gap-1">
                {isPagamento ? 'Sem telefone' : 'Retorno agendado'}
                {inDialog && lembrete.data_prevista && (
                  <span className="ml-1">
                    • {new Date(lembrete.data_prevista + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {inDialog && (
              <WhatsAppStatusBadge status={whatsappStatus} />
            )}
            {isPagamento && lembrete.valor_parcela && (
              <span className="font-semibold text-foreground text-sm">
                {formatCurrency(lembrete.valor_parcela)}
              </span>
            )}
          </div>
        </Link>
        {inDialog && whatsappStatus !== 'enviado' && whatsappStatus !== 'enviando' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                title="Opções de envio"
              >
                <Send className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!lembrete.cliente_telefone) {
                    toast.error('Cliente sem telefone cadastrado');
                    return;
                  }
                  if (selectedInstances.length === 0) {
                    toast.error('Selecione uma instância WhatsApp primeiro');
                    return;
                  }
                   const instance = selectedInstances[roundRobinRef.current % selectedInstances.length];
                   roundRobinRef.current += 1;
                   sendSingleMessage(
                    {
                      id: lembrete.id,
                      cliente_nome: lembrete.cliente_nome,
                      cliente_telefone: lembrete.cliente_telefone!,
                      valor_parcela: lembrete.valor_parcela,
                      data_prevista: lembrete.data_prevista,
                      tipo: lembrete.tipo,
                      acordo_id: lembrete.acordo_id,
                    },
                    instance,
                    templates,
                    operadorNome
                  );
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Enviar mensagem
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!lembrete.cliente_telefone) {
                    toast.error('Cliente sem telefone cadastrado');
                    return;
                  }
                  if (selectedInstances.length === 0) {
                    toast.error('Selecione uma instância WhatsApp primeiro');
                    return;
                  }
                  // Find the audio_url for this reminder type
                  const tipoKey = lembrete.tipo === 'hoje' ? 'dia_vencimento'
                    : lembrete.tipo === 'tres_dias' ? '3_dias'
                    : (() => {
                        const hoje = new Date();
                        const vencimento = new Date(lembrete.data_prevista + 'T00:00:00');
                        const diffDays = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
                        return `vencido_d${diffDays}`;
                      })();
                   const tpl = templates.find(t => t.tipo_lembrete === tipoKey)
                     || (() => {
                       if (!tipoKey.startsWith('vencido_d')) return undefined;
                       const dias = parseInt(tipoKey.replace('vencido_d', ''));
                       const vencidoTemplates = templates
                         .filter(t => t.tipo_lembrete.startsWith('vencido_d') && t.tipo_lembrete !== 'vencido_generico')
                         .map(t => ({ ...t, dias: parseInt(t.tipo_lembrete.replace('vencido_d', '')) }))
                         .filter(t => !isNaN(t.dias) && t.dias <= dias)
                         .sort((a, b) => b.dias - a.dias);
                       return vencidoTemplates[0] || templates.find(t => t.tipo_lembrete === 'vencido_generico');
                     })();
                   if (!tpl?.audio_url) {
                     toast.error('Nenhum áudio configurado para este tipo de lembrete');
                     return;
                   }
                  const instance = selectedInstances[roundRobinRef.current % selectedInstances.length];
                  roundRobinRef.current += 1;
                  (async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke('send-whatsapp-audio', {
                        body: {
                          telefone: lembrete.cliente_telefone,
                          audio_url: tpl.audio_url,
                          uazapi_server_url: instance.server_url,
                          uazapi_instance_token: instance.instance_token,
                          instancia_id: instance.id,
                        },
                      });
                      if (error) throw error;
                      if (data && !data.success) {
                        const msg = data.error || 'Erro desconhecido';
                        const friendly = msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : msg;
                        toast.error(friendly);
                        return;
                      }
                      markAsEnviado(lembrete.id, lembrete.cliente_nome, lembrete.cliente_telefone || '');
                      const instNome = instance.nome || instance.server_url?.replace(/https?:\/\//, '').split('.')[0] || 'instância';
                      toast.success(`Áudio enviado para ${lembrete.cliente_nome} pelo número ${instNome}`);
                    } catch (err: any) {
                      const msg = err.message || '';
                      const friendly = msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : `Erro ao enviar áudio: ${msg}`;
                      toast.error(friendly);
                    }
                  })();
                }}
              >
                <Volume2 className="h-4 w-4" />
                Enviar áudio
               </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!lembrete.cliente_telefone) {
                    toast.error('Cliente sem telefone cadastrado');
                    return;
                  }
                  if (selectedInstances.length === 0) {
                    toast.error('Selecione uma instância WhatsApp primeiro');
                    return;
                  }
                  const tipoKey = lembrete.tipo === 'hoje' ? 'dia_vencimento'
                    : lembrete.tipo === 'tres_dias' ? '3_dias'
                    : (() => {
                        const hoje = new Date();
                        const vencimento = new Date(lembrete.data_prevista + 'T00:00:00');
                        const diffDays = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
                        return `vencido_d${diffDays}`;
                      })();
                  const tpl = templates.find(t => t.tipo_lembrete === tipoKey)
                    || (() => {
                      if (!tipoKey.startsWith('vencido_d')) return undefined;
                      const dias = parseInt(tipoKey.replace('vencido_d', ''));
                      const vencidoTemplates = templates
                        .filter(t => t.tipo_lembrete.startsWith('vencido_d') && t.tipo_lembrete !== 'vencido_generico')
                        .map(t => ({ ...t, dias: parseInt(t.tipo_lembrete.replace('vencido_d', '')) }))
                        .filter(t => !isNaN(t.dias) && t.dias <= dias)
                        .sort((a, b) => b.dias - a.dias);
                      return vencidoTemplates[0] || templates.find(t => t.tipo_lembrete === 'vencido_generico');
                    })();
                  if (!tpl?.audio_url) {
                    toast.error('Nenhum áudio configurado para este tipo de lembrete');
                    return;
                  }
                  if (!tpl?.botoes_texto || !tpl?.botoes_choices || tpl.botoes_choices.length === 0) {
                    toast.error('Nenhum botão configurado para este tipo de lembrete');
                    return;
                  }
                  const instance = selectedInstances[roundRobinRef.current % selectedInstances.length];
                  roundRobinRef.current += 1;
                  (async () => {
                    try {
                      // 1. Send audio
                      const audioRes = await supabase.functions.invoke('send-whatsapp-audio', {
                        body: {
                          telefone: lembrete.cliente_telefone,
                          audio_url: tpl.audio_url,
                          uazapi_server_url: instance.server_url,
                          uazapi_instance_token: instance.instance_token,
                          instancia_id: instance.id,
                        },
                      });
                      if (audioRes.error) throw audioRes.error;
                      if (audioRes.data && !audioRes.data.success) {
                        const msg = audioRes.data.error || 'Erro desconhecido';
                        toast.error(msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : msg);
                        return;
                      }

                      // 2. Wait 3 seconds
                      await new Promise(r => setTimeout(r, 3000));

                      // 3. Replace variables in botoes_texto
                      const primeiroNome = lembrete.cliente_nome?.split(' ')[0] || '';
                      const nomeFormatado = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
                      const nomeCompleto = (lembrete.cliente_nome || '').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                      const hoje = new Date();
                      const vencimento = new Date(lembrete.data_prevista + 'T00:00:00');
                      const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24)));
                      const textoFinal = (tpl.botoes_texto || '')
                        .replace(/{nome_cliente}/g, nomeCompleto)
                        .replace(/{primeiro_nome}/g, nomeFormatado)
                        .replace(/{nome_operador}/g, operadorNome)
                        .replace(/{valor}/g, `R$ ${Number(lembrete.valor_parcela).toFixed(2).replace('.', ',')}`)
                        .replace(/{data_vencimento}/g, new Date(lembrete.data_prevista + 'T00:00:00').toLocaleDateString('pt-BR'))
                        .replace(/{dias_atraso}/g, String(diasAtraso));

                      // 4. Send buttons
                      const btnRes = await supabase.functions.invoke('send-whatsapp-buttons', {
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
                      if (btnRes.error) throw btnRes.error;
                      if (btnRes.data && !btnRes.data.success) {
                        toast.error('Áudio enviado, mas erro nos botões: ' + (btnRes.data.error || ''));
                        return;
                      }

                      markAsEnviado(lembrete.id, lembrete.cliente_nome, lembrete.cliente_telefone || '');
                      const instNome = instance.nome || instance.server_url?.replace(/https?:\/\//, '').split('.')[0] || 'instância';
                      toast.success(`Áudio + botões enviados para ${lembrete.cliente_nome} pelo número ${instNome}`);
                    } catch (err: any) {
                      const msg = err.message || '';
                      toast.error(msg.includes('not on WhatsApp') ? 'Este número não possui WhatsApp registrado' : `Erro ao enviar: ${msg}`);
                    }
                  })();
                }}
              >
                <Volume2 className="h-4 w-4" />
                Áudio + Botões
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  markAsEnviado(lembrete.id, lembrete.cliente_nome, lembrete.cliente_telefone || '');
                  toast.success('Marcado como enviado');
                }}
              >
                <CheckCircle className="h-4 w-4" />
                Marcar como enviado
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:bg-accent hover:text-accent-foreground"
          onClick={(e) => handleMarcarLido(e, lembrete.id)}
          title="Marcar como visto"
        >
          <Check className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const renderHistoricoItem = (lembrete: any) => {
    const isPagamento = lembrete.categoria === 'pagamento';
    const linkTo = isPagamento ? `/acordos/${lembrete.acordo_id}` : '/retornos';

    return (
      <div
        key={lembrete.id}
        className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
      >
        <Link
          to={linkTo}
          className="flex items-center justify-between flex-1 min-w-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {!isPagamento && <Phone className="h-3 w-3 text-primary shrink-0" />}
              <span className="font-medium text-foreground text-sm truncate flex items-center gap-1">
                {lembrete.cliente_nome}
                <CopyButton value={lembrete.cliente_nome} label="Nome" preserveText />
              </span>
            </div>
            {lembrete.cliente_telefone ? (
              <span className="text-muted-foreground text-xs flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                {lembrete.cliente_telefone}
                <CopyButton value={lembrete.cliente_telefone} label="Telefone" />
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {isPagamento
                  ? `${lembrete.tipo === 'vencido' ? 'Vencida' : lembrete.tipo === 'hoje' ? 'Vence hoje' : 'Vence em 3 dias'}`
                  : `Retorno • ${lembrete.tipo === 'hoje' ? 'Hoje' : 'Em 3 dias'}`
                }
              </span>
            )}
          </div>
          {isPagamento && lembrete.valor_parcela && (
            <span className="font-semibold text-foreground text-sm ml-2">
              {formatCurrency(lembrete.valor_parcela)}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:bg-accent hover:text-accent-foreground"
          onClick={(e) => handleDesmarcarLido(e, lembrete.id)}
          title="Mostrar novamente"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const renderFullContent = (inDialog = false) => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className={`w-full grid grid-cols-2 ${inDialog ? '' : 'rounded-none border-b'}`}>
        <TabsTrigger value="pendentes" className="gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          Pendentes
          {totalLembretes > 0 && (
            <span className="ml-1 text-xs bg-destructive text-destructive-foreground rounded-full px-1.5">
              {totalLembretes}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="historico" className="gap-1.5">
          <History className="h-3.5 w-3.5" />
          Histórico
          {lembretesJaLidos.length > 0 && (
            <span className="ml-1 text-xs bg-muted-foreground/20 text-muted-foreground rounded-full px-1.5">
              {lembretesJaLidos.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pendentes" className={inDialog ? 'mt-3' : 'mt-0'}>
        {!temLembretes ? (
          <div className="p-4 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum lembrete pendente</p>
          </div>
        ) : (
          <div className={inDialog ? 'space-y-3' : 'max-h-80 overflow-y-auto scrollbar-thin'}>
            {lembretesHoje.length > 0 && (
              <div className={inDialog ? '' : 'p-3 border-b border-border'}>
                <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Vence hoje
                  {enviadosHoje > 0 && (
                    <Badge className="bg-emerald-600 text-white flex items-center gap-1 text-[10px] px-1.5 py-0.5">
                      <Send className="h-3 w-3" /> {enviadosHoje} enviado{enviadosHoje > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {!inDialog && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" title="Expandir lembretes" onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); setDialogOpen(true); }}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </h4>
                <div className="space-y-2">
                  {lembretesHoje.map((lembrete) =>
                    renderLembreteItem(lembrete, 'bg-destructive/10', 'hover:bg-destructive/20', inDialog)
                  )}
                </div>
              </div>
            )}

            {lembretesVencidos.length > 0 && (
              <div className={inDialog ? '' : 'p-3 border-b border-border'}>
                <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Parcelas Vencidas ({lembretesVencidos.length})
                  {enviadosVencidos > 0 && (
                    <Badge className="bg-emerald-600 text-white flex items-center gap-1 text-[10px] px-1.5 py-0.5">
                      <Send className="h-3 w-3" /> {enviadosVencidos} enviado{enviadosVencidos > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {!inDialog && lembretesHoje.length === 0 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" title="Expandir lembretes" onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); setDialogOpen(true); }}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </h4>
                <div className="space-y-2">
                  {lembretesVencidos.map((lembrete) =>
                    renderLembreteItem(lembrete, 'bg-destructive/10', 'hover:bg-destructive/20', inDialog)
                  )}
                </div>
              </div>
            )}

            {lembretesTresDias.length > 0 && (
              <div className={inDialog ? '' : 'p-3'}>
                <h4 className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Vence em 3 dias
                  {enviadosTresDias > 0 && (
                    <Badge className="bg-emerald-600 text-white flex items-center gap-1 text-[10px] px-1.5 py-0.5">
                      <Send className="h-3 w-3" /> {enviadosTresDias} enviado{enviadosTresDias > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {!inDialog && lembretesHoje.length === 0 && lembretesVencidos.length === 0 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" title="Expandir lembretes" onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); setDialogOpen(true); }}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </h4>
                <div className="space-y-2">
                  {lembretesTresDias.map((lembrete) =>
                    renderLembreteItem(lembrete, 'bg-warning/10', 'hover:bg-warning/20', inDialog)
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="historico" className={inDialog ? 'mt-3' : 'mt-0'}>
        {lembretesJaLidos.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum lembrete no histórico</p>
          </div>
        ) : (
          <div className={inDialog ? 'space-y-2 pt-1' : 'max-h-80 overflow-y-auto p-3 scrollbar-thin'}>
            {lembretesJaLidos.map((lembrete) => renderHistoricoItem(lembrete))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {totalLembretes > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {totalLembretes > 9 ? '9+' : totalLembretes}
              </span>
            )}
            {isSending && (
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          {renderFullContent(false)}
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Lembretes
              {isSending && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-xs gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Enviando...
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin pr-1">
            <div className="space-y-4">
              {/* WhatsApp instance selector + send button */}
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">WhatsApp</span>
                  <div className="flex gap-2">
                    {isSending ? (
                      <Button variant="destructive" size="sm" onClick={cancelSending} className="gap-1.5">
                        <Square className="h-3.5 w-3.5" />
                        Cancelar Envio
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {selectedInstanceIds.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedInstanceIds.length}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={selectedInstanceIds.length === 0 || totalLembretes === 0}
                          onClick={handleStartEnvios}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Iniciar Envio
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {instances.map((inst) => (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => toggleInstance(inst.id)}
                      disabled={isSending}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        selectedInstanceIds.includes(inst.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-accent'
                      } ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className={`h-2 w-2 rounded-full ${selectedInstanceIds.includes(inst.id) ? 'bg-primary-foreground' : 'bg-muted-foreground/40'}`} />
                      {inst.nome || inst.instance_token.slice(0, 12) + '...'}
                    </button>
                  ))}
                  {instances.length === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhuma instância conectada</span>
                  )}
                </div>

                {/* Tipo de envio */}
                <div className="flex items-center gap-4 pt-1">
                  <span className="text-xs font-medium text-muted-foreground">Tipo de envio:</span>
                  <RadioGroup
                    value={tipoEnvio}
                    onValueChange={(v) => setTipoEnvio(v as 'texto' | 'audio' | 'audio_botoes')}
                    className="flex gap-4"
                    disabled={isSending}
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="texto" id="tipo-texto" />
                      <Label htmlFor="tipo-texto" className="text-xs cursor-pointer flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> Texto
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="audio" id="tipo-audio" />
                      <Label htmlFor="tipo-audio" className="text-xs cursor-pointer flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> Áudio
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="audio_botoes" id="tipo-audio-botoes" />
                      <Label htmlFor="tipo-audio-botoes" className="text-xs cursor-pointer flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> Áudio + Botões
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Intervalo de delay */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-medium text-muted-foreground">Intervalo:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Min</span>
                    <Input
                      type="number"
                      min={1}
                      max={maxDelay || undefined}
                      value={minDelay === 0 ? '' : minDelay}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMinDelay(val === '' ? 0 : parseInt(val) || 0);
                      }}
                      onBlur={() => { if (minDelay < 1) setMinDelay(1); }}
                      disabled={isSending}
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">seg</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Max</span>
                    <Input
                      type="number"
                      min={minDelay || 1}
                      value={maxDelay === 0 ? '' : maxDelay}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMaxDelay(val === '' ? 0 : parseInt(val) || 0);
                      }}
                      onBlur={() => { if (maxDelay < (minDelay || 1)) setMaxDelay(minDelay || 1); }}
                      disabled={isSending}
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">seg</span>
                  </div>
                </div>
              </div>

              {/* Progress bar + last sent info */}
              {(isSending || enviadosCount > 0 || errosCount > 0) && (
                <div className="space-y-1">
                  <Progress value={progressPercent} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{enviadosCount} enviado{enviadosCount !== 1 ? 's' : ''}</span>
                    {errosCount > 0 && <span className="text-destructive">{errosCount} erro{errosCount !== 1 ? 's' : ''}</span>}
                    <span>{naoEnviadosCount} restante{naoEnviadosCount !== 1 ? 's' : ''}</span>
                  </div>
                  {ultimoEnvio && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Último envio: {new Date(ultimoEnvio.enviado_em!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      {ultimoEnvio.cliente_nome && <span>— {ultimoEnvio.cliente_nome}</span>}
                    </div>
                  )}
                </div>
              )}

              {renderFullContent(true)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
