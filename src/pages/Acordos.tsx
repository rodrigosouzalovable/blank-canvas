import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CopyButton } from '@/components/CopyButton';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppSending } from '@/contexts/WhatsAppSendingContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatarMoeda, formatarData } from '@/lib/comissao';
import { PlusCircle, Search, FileText, Trash2, Phone, User, Download, Clock, Send, MessageCircle, Loader2, TrendingUp, Trophy, Square, XCircle, CalendarIcon, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';
import { RankingMensal } from '@/components/RankingMensal';
import { exportarParaExcel } from '@/lib/exportExcel';
import { Tables } from '@/integrations/supabase/types';
type Acordo = Tables<'acordos'>;

interface WhatsAppInstance {
  id: string;
  nome: string | null;
  server_url: string;
  instance_token: string;
}

interface LembreteTemplate {
  tipo_lembrete: string;
  mensagem: string;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function substituirVariaveis(template: string, vars: {
  nome_cliente: string;
  primeiro_nome: string;
  nome_operador: string;
  valor: string;
  data_vencimento: string;
  dias_atraso: number;
}): string {
  return template
    .replace(/\{nome_cliente\}/g, vars.nome_cliente)
    .replace(/\{primeiro_nome\}/g, vars.primeiro_nome)
    .replace(/\{nome_operador\}/g, vars.nome_operador)
    .replace(/\{valor\}/g, vars.valor)
    .replace(/\{data_vencimento\}/g, vars.data_vencimento)
    .replace(/\{dias_atraso\}/g, String(vars.dias_atraso));
}

function gerarMensagemComTemplate(
  clienteNome: string,
  operadorNome: string,
  valorParcela: number,
  dataPrevista: string,
  templates: LembreteTemplate[],
  tipo: 'vencido' | 'hoje' | '3_dias'
): string {
  const nomeCompleto = toTitleCase(clienteNome);
  const primeiroNome = nomeCompleto.split(' ')[0];
  const valor = formatCurrency(valorParcela);
  const dataStr = dataPrevista
    ? new Date(dataPrevista + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';

  const hoje = new Date();
  const venc = new Date(dataPrevista + 'T00:00:00');
  const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));

  let tipoKey = '';
  if (tipo === 'vencido') {
    tipoKey = `vencido_d${diasAtraso}`;
  } else if (tipo === 'hoje') {
    tipoKey = 'dia_vencimento';
  } else {
    tipoKey = '3_dias';
  }

  let matched = templates.filter(t => t.tipo_lembrete === tipoKey);

  if (matched.length === 0 && tipo === 'vencido') {
    const vencidoTemplates = templates
      .filter(t => t.tipo_lembrete.startsWith('vencido_d'))
      .map(t => ({ ...t, dias: parseInt(t.tipo_lembrete.replace('vencido_d', ''), 10) }))
      .filter(t => !isNaN(t.dias))
      .sort((a, b) => b.dias - a.dias);
    const closest = vencidoTemplates.find(t => t.dias <= diasAtraso);
    if (closest) matched = templates.filter(t => t.tipo_lembrete === `vencido_d${closest.dias}`);
  }

  if (matched.length > 0) {
    const chosen = matched[Math.floor(Math.random() * matched.length)];
    return substituirVariaveis(chosen.mensagem, {
      nome_cliente: nomeCompleto,
      primeiro_nome: primeiroNome,
      nome_operador: operadorNome || 'Operador',
      valor,
      data_vencimento: dataStr,
      dias_atraso: diasAtraso,
    });
  }

  // Fallback
  if (tipo === 'vencido') {
    return `Olá ${primeiroNome}, tudo bem? Identificamos que a parcela de ${valor} com vencimento em ${dataStr} encontra-se em aberto há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}. Por favor, regularize o pagamento e envie o comprovante.`;
  }
  if (tipo === 'hoje') {
    return `Olá ${primeiroNome}, tudo bem? Lembramos que hoje é o vencimento da sua parcela de ${valor}. Por favor, efetue o pagamento e nos envie o comprovante. Obrigado!`;
  }
  return `Olá ${primeiroNome}, tudo bem? Informamos que sua parcela de ${valor} vence em ${dataStr}. Fique atento para não perder o prazo!`;
}

// Componente para exibir cada card de acordo
function AcordoCard({
  acordo,
  onDelete,
  onEnviarWhatsApp,
  enviandoWhatsApp,
  getStatusVariant,
  getStatusLabel,
  isNegociado = false,
  isVencido = false,
  isQuebraAcordo = false,
  envioStatus,
  cpfDuplicadoOutros = [],
}: {
  acordo: Acordo;
  onDelete: () => void;
  onEnviarWhatsApp: (acordo: Acordo) => void;
  enviandoWhatsApp: string | null;
  getStatusVariant: (status: string) => "default" | "secondary" | "destructive" | "outline";
  getStatusLabel: (status: string) => string;
  isNegociado?: boolean;
  isVencido?: boolean;
  isQuebraAcordo?: boolean;
  envioStatus?: 'enviado' | 'erro' | 'enviando';
  cpfDuplicadoOutros?: Array<{ id: string; cliente_nome: string }>;
}) {
  const isEnviando = enviandoWhatsApp === acordo.id;
  return <Link to={`/acordos/${acordo.id}`}>
      <Card className={cn("hover:border-primary/50 transition-all cursor-pointer",
    // VERDE - Mensagem enviada com sucesso
    envioStatus === 'enviado' && "border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 dark:border-green-600",
    // VERMELHO - Parcela vencida (prioridade máxima) - só se não enviado
    envioStatus !== 'enviado' && isNegociado && isVencido && "border-destructive bg-gradient-to-r from-red-50 to-rose-50 ring-2 ring-destructive/60 shadow-lg shadow-red-200/50 animate-pulse dark:from-red-950/30 dark:to-rose-950/30 dark:border-destructive dark:ring-destructive/50 dark:shadow-red-500/20",
    // LARANJA - Aguardando boleto (apenas se não vencido e não enviado)
    envioStatus !== 'enviado' && isNegociado && !isVencido && !acordo.boleto_enviado && "border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50 ring-2 ring-orange-300 shadow-lg shadow-orange-200/50 animate-pulse dark:from-orange-950/30 dark:to-amber-950/30 dark:border-orange-500 dark:ring-orange-400/50 dark:shadow-orange-500/20")}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-1 flex-wrap">
                  {acordo.cliente_nome}
                  <CopyButton value={acordo.cliente_nome} label="Nome" preserveText />
                  {cpfDuplicadoOutros.length > 0 && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="border-orange-500 text-orange-600 bg-orange-50 dark:bg-orange-950/30 gap-1 cursor-help"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            CPF já lançado em outro acordo ({cpfDuplicadoOutros.length + 1}x)
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">Outros acordos com este CPF:</p>
                          <ul className="text-xs space-y-0.5">
                            {cpfDuplicadoOutros.slice(0, 5).map(o => (
                              <li key={o.id}>• {o.cliente_nome}</li>
                            ))}
                            {cpfDuplicadoOutros.length > 5 && (
                              <li className="italic">+ {cpfDuplicadoOutros.length - 5} outro(s)</li>
                            )}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </h3>
                {(acordo.cliente_cpf || acordo.cliente_telefone) && <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                    {acordo.cliente_cpf && <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {acordo.cliente_cpf}
                        <CopyButton value={acordo.cliente_cpf} label="CPF" />
                      </span>}
                    {acordo.cliente_telefone && <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {acordo.cliente_telefone}
                        <CopyButton value={acordo.cliente_telefone} label="Telefone" />
                      </span>}
                  </div>}
                <p className="text-sm text-muted-foreground mt-1">
                  {acordo.parcelas}x de {formatarMoeda(acordo.valor_parcela)} • {acordo.dias_atraso} dias em atraso
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Criado em {formatarData(acordo.criado_em)}
                </p>
                <p className="text-xs text-muted-foreground my-[5px]">
                  Vencimento: {formatarData(acordo.data_primeiro_pagamento)}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Badge de QUEBRA DE ACORDO - prioridade máxima */}
                {isQuebraAcordo && (
                  <Badge variant="destructive" className="bg-red-600 text-white font-bold">
                    QUEBRA DE ACORDO
                  </Badge>
                )}
                {/* Badge de Parcela Vencida */}
                {isNegociado && isVencido && !isQuebraAcordo && <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                    <Clock className="h-3 w-3 mr-1" />
                    Parcela Vencida
                  </Badge>}
                {/* Flag de status do boleto - apenas para acordos negociados não vencidos */}
                {isNegociado && !isVencido && <Badge variant="outline" className={acordo.boleto_enviado ? "bg-secondary/20 text-secondary border-secondary/30" : "bg-warning/20 text-warning border-warning/30"}>
                    {acordo.boleto_enviado ? <>
                        <Send className="h-3 w-3 mr-1" />
                        Boleto Enviado
                      </> : <>
                        <Clock className="h-3 w-3 mr-1" />
                        Aguardando envio do boleto
                      </>}
                  </Badge>}
                <Badge variant={getStatusVariant(acordo.status)}>
                  {getStatusLabel(acordo.status)}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30" onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onEnviarWhatsApp(acordo);
              }} disabled={isEnviando || !acordo.cliente_telefone} title={acordo.cliente_telefone ? "Enviar WhatsApp" : "Telefone não cadastrado"}>
                  {isEnviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="font-semibold">{formatarMoeda(acordo.valor_total)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Comissão</p>
                <p className="font-semibold text-secondary">{formatarMoeda(acordo.comissao_total)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>;
}

// Painel de envio em lote
function BulkSendPanel({
  acordos,
  instances,
  templates,
  operadorNome,
  isSending,
  onStartSending,
  onCancelSending,
}: {
  acordos: Acordo[];
  instances: WhatsAppInstance[];
  templates: LembreteTemplate[];
  operadorNome: string;
  isSending: boolean;
  onStartSending: (acordos: Acordo[], selectedInstances: WhatsAppInstance[]) => void;
  onCancelSending: () => void;
}) {
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());

  const toggleInstance = (id: string) => {
    setSelectedInstanceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const acordosComTelefone = acordos.filter(a => a.cliente_telefone);
  const selectedInstances = instances.filter(i => selectedInstanceIds.has(i.id));

  if (instances.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              Envio em lote — {acordosComTelefone.length} acordo(s) com telefone
            </p>
            <div className="flex flex-wrap gap-3">
              {instances.map((inst) => (
                <label key={inst.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedInstanceIds.has(inst.id)}
                    onCheckedChange={() => toggleInstance(inst.id)}
                    disabled={isSending}
                  />
                  {inst.nome || inst.server_url}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {isSending ? (
              <Button
                variant="destructive"
                onClick={onCancelSending}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                Cancelar Envios
              </Button>
            ) : (
              <Button
                onClick={() => onStartSending(acordosComTelefone, selectedInstances)}
                disabled={selectedInstances.length === 0 || acordosComTelefone.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <Send className="h-4 w-4" />
                ENVIAR ({acordosComTelefone.length})
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente para estado vazio
function EmptyState({
  search,
  statusFilter,
  message = "Nenhum acordo encontrado"
}: {
  search: string;
  statusFilter: string;
  message?: string;
}) {
  return <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{message}</h3>
        <p className="text-muted-foreground text-center mb-4">
          {search || statusFilter !== 'todos' ? 'Tente ajustar os filtros' : 'Comece cadastrando seu primeiro acordo'}
        </p>
        {!search && statusFilter === 'todos' && <Button asChild>
            <Link to="/acordos/novo">
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Acordo
            </Link>
          </Button>}
      </CardContent>
    </Card>;
}
export default function Acordos() {
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const { isSending, statusMap, startSending, cancelSending } = useWhatsAppSending();
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [acordoParaExcluir, setAcordoParaExcluir] = useState<Acordo | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'pagos' | 'negociados' | 'proximas' | 'acordos_realizados' | 'vencidos'>('negociados');
  const [acordosComPagamentosPagos, setAcordosComPagamentosPagos] = useState<Set<string>>(new Set());
  const [acordosComParcelasVencidas, setAcordosComParcelasVencidas] = useState<Set<string>>(new Set());
  const [acordosComParcelasProximas, setAcordosComParcelasProximas] = useState<Set<string>>(new Set());
  const [acordosComQuebraAcordo, setAcordosComQuebraAcordo] = useState<Set<string>>(new Set());
  const [dataProximaPorAcordo, setDataProximaPorAcordo] = useState<Map<string, string>>(new Map());
  const [dataVencidaPorAcordo, setDataVencidaPorAcordo] = useState<Map<string, string>>(new Map());
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('todos');
  const [rankingAberto, setRankingAberto] = useState(false);
  const [filtroDataVencimento, setFiltroDataVencimento] = useState<Date | undefined>(undefined);
  const [todasDatasPorAcordo, setTodasDatasPorAcordo] = useState<Map<string, string[]>>(new Map());

  // Buscar perfil do operador para nome dinâmico
  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('nome').eq('id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Buscar todas as instâncias WhatsApp ativas do usuário
  const { data: whatsappInstances } = useQuery({
    queryKey: ['my-whatsapp-instances', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('user_whatsapp_instances').select('id, nome, server_url, instance_token').eq('user_id', user!.id).eq('ativo', true);
      return (data || []) as WhatsAppInstance[];
    },
    enabled: !!user,
  });

  // Buscar templates de lembretes do usuário
  const { data: lembreteTemplates } = useQuery({
    queryKey: ['my-lembrete-templates', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('lembrete_mensagens_templates').select('tipo_lembrete, mensagem').eq('user_id', user!.id).eq('ativo', true);
      return (data || []) as LembreteTemplate[];
    },
    enabled: !!user,
  });

  const { data: funcionarios } = useQuery({
    queryKey: ['funcionarios-list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_funcionarios' as any);
      if (error) throw error;
      return data as { user_id: string; nome: string }[];
    },
  });

  const { data: acordosHoje } = useQuery({
    queryKey: ['acordos-hoje-count', selectedUserId],
    queryFn: async () => {
      const params = selectedUserId !== 'todos' ? { p_user_id: selectedUserId } : {};
      const { data, error } = await supabase.rpc('contar_acordos_hoje_por_usuario' as any, params);
      if (error) throw error;
      return data as number;
    },
  });

  const [whatsappDialogAcordo, setWhatsappDialogAcordo] = useState<Acordo | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [sendingWhatsappDialog, setSendingWhatsappDialog] = useState(false);

  const handleEnviarWhatsApp = useCallback(async (acordo: Acordo) => {
    if (!acordo.cliente_telefone) {
      toast({
        variant: 'destructive',
        title: 'Telefone não cadastrado',
        description: 'Este cliente não possui telefone cadastrado.'
      });
      return;
    }
    const instances = whatsappInstances || [];
    if (instances.length === 0) {
      toast({
        variant: 'destructive',
        title: 'WhatsApp não configurado',
        description: 'Configure uma instância WhatsApp no menu de Acionamento.'
      });
      return;
    }
    // If only 1 instance, use it directly
    if (instances.length === 1) {
      setSelectedInstanceId(instances[0].id);
    } else {
      setSelectedInstanceId('');
    }
    setWhatsappDialogAcordo(acordo);
  }, [toast, whatsappInstances]);

  const handleConfirmarEnvioWhatsApp = useCallback(async () => {
    const acordo = whatsappDialogAcordo;
    if (!acordo) return;
    const instances = whatsappInstances || [];
    const instance = instances.find(i => i.id === selectedInstanceId);
    if (!instance) return;

    setSendingWhatsappDialog(true);
    setEnviandoWhatsApp(acordo.id);
    try {
      // Fetch next pending installment for this agreement
      const { data: proximaParcela } = await supabase
        .from('pagamentos')
        .select('valor_parcela, data_prevista')
        .eq('acordo_id', acordo.id)
        .eq('status', 'pendente')
        .order('data_prevista', { ascending: true })
        .limit(1)
        .single();

      const valorParcela = proximaParcela?.valor_parcela || acordo.valor_parcela;
      const dataPrevista = proximaParcela?.data_prevista || acordo.data_primeiro_pagamento;

      // Determine tipo based on the tab / date
      let tipo: 'vencido' | 'hoje' | '3_dias' = '3_dias';
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];
      if (dataPrevista < hojeStr) {
        tipo = 'vencido';
      } else if (dataPrevista === hojeStr) {
        tipo = 'hoje';
      }

      const nomeOperador = profile?.nome || 'Operador';
      const templates = lembreteTemplates || [];
      const mensagem = gerarMensagemComTemplate(
        acordo.cliente_nome,
        nomeOperador,
        valorParcela,
        dataPrevista,
        templates,
        tipo
      );

      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          telefone: acordo.cliente_telefone,
          mensagem,
          uazapi_server_url: instance.server_url,
          uazapi_instance_token: instance.instance_token,
          instancia_id: instance.id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao enviar mensagem');

      toast({
        title: 'Mensagem enviada!',
        description: `WhatsApp enviado para ${acordo.cliente_nome}`
      });
      setWhatsappDialogAcordo(null);
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar a mensagem via WhatsApp.'
      });
    } finally {
      setEnviandoWhatsApp(null);
      setSendingWhatsappDialog(false);
    }
  }, [whatsappDialogAcordo, whatsappInstances, selectedInstanceId, profile, lembreteTemplates, toast]);
  useEffect(() => {
    async function loadAcordos() {
      if (!user) return;
      try {
        // Carregar acordos próprios
        const {
          data: acordosData,
          error: acordosError
        } = await supabase.from('acordos').select('*').eq('user_id', user.id).order('criado_em', {
          ascending: false
        });
        if (acordosError) throw acordosError;
        
        // Verificar se tem acordos compartilhados
        const { data: perms } = await supabase
          .from('user_permissions')
          .select('acordos_compartilhados, concedido_por')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const temCompartilhados = (perms as any)?.acordos_compartilhados === true;
        const adminId = (perms as any)?.concedido_por as string | null;
        
        let todosAcordos = acordosData || [];
        
        if (temCompartilhados && adminId) {
          const { data: acordosAdmin } = await supabase
            .from('acordos')
            .select('*')
            .eq('user_id', adminId)
            .order('criado_em', { ascending: false });
          if (acordosAdmin) {
            // Marcar acordos do admin e combinar (sem duplicatas)
            const idsExistentes = new Set(todosAcordos.map(a => a.id));
            const novos = acordosAdmin.filter(a => !idsExistentes.has(a.id));
            todosAcordos = [...todosAcordos, ...novos];
          }
        }
        
        setAcordos(todosAcordos);

        // Carregar IDs de acordos que têm parcelas pagas
        const {
          data: pagamentosPagos,
          error: pagamentosError
        } = await supabase.from('pagamentos').select('acordo_id').eq('status', 'pago');
        if (pagamentosError) throw pagamentosError;
        const idsComPagamentos = new Set(pagamentosPagos?.map(p => p.acordo_id) || []);
        setAcordosComPagamentosPagos(idsComPagamentos);

        // Carregar IDs de acordos que têm parcelas vencidas (pendentes com data_prevista < hoje)
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const {
          data: pagamentosPendentes,
          error: pendentesError
        } = await supabase.from('pagamentos').select('acordo_id, data_prevista').eq('status', 'pendente').lt('data_prevista', hojeStr);
        if (pendentesError) throw pendentesError;
        
        // Criar Map com menor data por acordo (mais antiga = mais urgente)
        const vencidasMap = new Map<string, string>();
        pagamentosPendentes?.forEach(p => {
          const atual = vencidasMap.get(p.acordo_id);
          if (!atual || p.data_prevista < atual) {
            vencidasMap.set(p.acordo_id, p.data_prevista);
          }
        });
        setDataVencidaPorAcordo(vencidasMap);
        setAcordosComParcelasVencidas(new Set(vencidasMap.keys()));

        // Carregar IDs de acordos que têm parcelas próximas ao vencimento (hoje até +3 dias)
        const tresDias = new Date(hoje);
        tresDias.setDate(tresDias.getDate() + 3);
        const tresDiasStr = tresDias.toISOString().split('T')[0];
        const {
          data: parcelasProximas,
          error: proximasError
        } = await supabase.from('pagamentos').select('acordo_id, data_prevista').eq('status', 'pendente').gte('data_prevista', hojeStr).lte('data_prevista', tresDiasStr);
        if (proximasError) throw proximasError;
        
        // Criar Map com menor data por acordo (mais próxima primeiro)
        const proximasMap = new Map<string, string>();
        parcelasProximas?.forEach(p => {
          const atual = proximasMap.get(p.acordo_id);
          if (!atual || p.data_prevista < atual) {
            proximasMap.set(p.acordo_id, p.data_prevista);
          }
        });
        setDataProximaPorAcordo(proximasMap);
        setAcordosComParcelasProximas(new Set(proximasMap.keys()));

        // Carregar IDs de acordos com QUEBRA DE ACORDO
        // (status 'quebrado' OU última parcela pendente vencida há mais de 10 dias)
        const dezDiasAtras = new Date(hoje);
        dezDiasAtras.setDate(dezDiasAtras.getDate() - 10);
        const dezDiasAtrasStr = dezDiasAtras.toISOString().split('T')[0];
        
        // Acordos com status 'quebrado' já são quebra de acordo
        const idsComQuebra = new Set<string>();
        (acordosData || []).forEach(a => {
          if (a.status === 'quebrado') {
            idsComQuebra.add(a.id);
          }
        });
        
        // Buscar TODAS as parcelas (pagas e pendentes) paginando para evitar limite de 1000 linhas do Supabase
        // Pendentes -> usadas para detectar quebra (>10 dias) e para datas futuras no filtro
        // Pagas -> usadas no filtro por data de vencimento (cliente que pagou na data ainda deve aparecer)
        const todasParcelasPendentes: { acordo_id: string; data_prevista: string; status: string }[] = [];
        const PAGE_SIZE = 1000;
        let pageStart = 0;
        let quebraError: any = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: lote, error: loteError } = await supabase
            .from('pagamentos')
            .select('acordo_id, data_prevista, status')
            .order('acordo_id', { ascending: true })
            .range(pageStart, pageStart + PAGE_SIZE - 1);
          if (loteError) { quebraError = loteError; break; }
          if (!lote || lote.length === 0) break;
          todasParcelasPendentes.push(...lote);
          if (lote.length < PAGE_SIZE) break;
          pageStart += PAGE_SIZE;
        }

        if (!quebraError && todasParcelasPendentes.length > 0) {
          // Agrupar por acordo_id: MAX data_prevista (apenas pendentes p/ quebra) e TODAS as datas (p/ filtro)
          const ultimaParcelaPendentePorAcordo = new Map<string, string>();
          const allDatesMap = new Map<string, string[]>();
          todasParcelasPendentes.forEach(p => {
            // Para o filtro por vencimento: incluir parcelas pagas e pendentes
            const existing = allDatesMap.get(p.acordo_id) || [];
            existing.push(p.data_prevista);
            allDatesMap.set(p.acordo_id, existing);

            // Para a regra de quebra (>10 dias): considerar apenas pendentes
            if (p.status === 'pendente') {
              const atual = ultimaParcelaPendentePorAcordo.get(p.acordo_id);
              if (!atual || p.data_prevista > atual) {
                ultimaParcelaPendentePorAcordo.set(p.acordo_id, p.data_prevista);
              }
            }
          });
          setTodasDatasPorAcordo(allDatesMap);

          // Filtrar acordos cuja última parcela pendente está vencida há mais de 10 dias
          ultimaParcelaPendentePorAcordo.forEach((ultimaData, acordoId) => {
            if (ultimaData < dezDiasAtrasStr) {
              idsComQuebra.add(acordoId);
            }
          });
        }
        setAcordosComQuebraAcordo(idsComQuebra);
      } catch (error) {
        console.error('Erro ao carregar acordos:', error);
      } finally {
        setLoading(false);
      }
    }
    loadAcordos();
  }, [user]);
  const handleDelete = async (acordoId: string) => {
    try {
      const { error } = await supabase.rpc('delete_acordo_atomico' as any, { p_acordo_id: acordoId });
      if (error) throw error;

      setAcordos(prev => prev.filter(a => a.id !== acordoId));
      toast({
        title: 'Acordo excluído',
        description: 'O acordo foi removido com sucesso.'
      });
    } catch (error) {
      console.error('Erro ao excluir acordo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o acordo.'
      });
    }
  };
  const handleExportarExcel = (acordosParaExportar: Acordo[]) => {
    const dadosParaExportar = acordosParaExportar.map(acordo => ({
      cliente_nome: acordo.cliente_nome,
      cliente_cpf: acordo.cliente_cpf || '-',
      cliente_telefone: acordo.cliente_telefone || '-',
      parcelas: acordo.parcelas,
      valor_parcela: acordo.valor_parcela,
      valor_total: acordo.valor_total,
      comissao_total: acordo.comissao_total,
      percentual_comissao: `${acordo.percentual_comissao}%`,
      dias_atraso: acordo.dias_atraso,
      status: getStatusLabel(acordo.status),
      data_primeiro_pagamento: formatarData(acordo.data_primeiro_pagamento),
      criado_em: formatarData(acordo.criado_em),
      observacoes: acordo.observacoes || '-'
    }));
    const colunas: {
      chave: keyof typeof dadosParaExportar[0];
      titulo: string;
    }[] = [{
      chave: 'cliente_nome',
      titulo: 'Cliente'
    }, {
      chave: 'cliente_cpf',
      titulo: 'CPF'
    }, {
      chave: 'cliente_telefone',
      titulo: 'Telefone'
    }, {
      chave: 'parcelas',
      titulo: 'Parcelas'
    }, {
      chave: 'valor_parcela',
      titulo: 'Valor Parcela (R$)'
    }, {
      chave: 'valor_total',
      titulo: 'Valor Total (R$)'
    }, {
      chave: 'comissao_total',
      titulo: 'Comissão Total (R$)'
    }, {
      chave: 'percentual_comissao',
      titulo: '% Comissão'
    }, {
      chave: 'dias_atraso',
      titulo: 'Dias em Atraso'
    }, {
      chave: 'status',
      titulo: 'Status'
    }, {
      chave: 'data_primeiro_pagamento',
      titulo: 'Primeiro Pagamento'
    }, {
      chave: 'criado_em',
      titulo: 'Data Criação'
    }, {
      chave: 'observacoes',
      titulo: 'Observações'
    }];
    const nomeArquivo = abaAtiva === 'pagos' ? 'acordos_pagos' : abaAtiva === 'proximas' ? 'parcelas_proximas_vencimento' : abaAtiva === 'acordos_realizados' ? 'acordos_realizados' : abaAtiva === 'vencidos' ? 'parcelas_vencidas' : 'acordos_negociados';
    exportarParaExcel(dadosParaExportar, colunas, nomeArquivo);
    toast({
      title: 'Exportação concluída',
      description: `${acordosParaExportar.length} acordo(s) exportado(s) para Excel.`
    });
  };
  // Helper: check if an acordo has a parcela matching the selected date
  const matchesDateFilter = (acordoId: string) => {
    if (!filtroDataVencimento) return true;
    const datas = todasDatasPorAcordo.get(acordoId) || [];
    const selectedStr = format(filtroDataVencimento, 'yyyy-MM-dd');
    return datas.some(d => d === selectedStr);
  };

  // Mapa: cpf normalizado -> lista de acordos com esse CPF (apenas duplicados)
  const cpfDuplicadosMap = (() => {
    const map = new Map<string, Acordo[]>();
    acordos.forEach(a => {
      const c = (a.cliente_cpf || '').replace(/\D/g, '');
      if (c.length === 11) {
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(a);
      }
    });
    const dup = new Map<string, Acordo[]>();
    map.forEach((arr, k) => { if (arr.length > 1) dup.set(k, arr); });
    return dup;
  })();

  const getCpfDuplicadoOutros = (acordo: Acordo) => {
    const c = (acordo.cliente_cpf || '').replace(/\D/g, '');
    if (c.length !== 11) return [];
    const lista = cpfDuplicadosMap.get(c);
    if (!lista) return [];
    return lista.filter(a => a.id !== acordo.id).map(a => ({ id: a.id, cliente_nome: a.cliente_nome }));
  };

  const filteredAcordos = acordos.filter(acordo => {
    const termo = search.trim().toLowerCase();
    const digitos = search.replace(/\D/g, '');
    const nome = acordo.cliente_nome?.trim().toLowerCase() ?? '';
    const cpfDigits = acordo.cliente_cpf?.replace(/\D/g, '') ?? '';
    const telDigits = acordo.cliente_telefone?.replace(/\D/g, '') ?? '';
    const matchesSearch =
      !termo ||
      nome.includes(termo) ||
      (digitos.length >= 3 && (cpfDigits.includes(digitos) || telDigits.includes(digitos)));
    let matchesStatus: boolean;
    if (statusFilter === 'todos') {
      matchesStatus = true;
    } else if (statusFilter === 'duplicados') {
      const c = (acordo.cliente_cpf || '').replace(/\D/g, '');
      matchesStatus = c.length === 11 && cpfDuplicadosMap.has(c);
    } else {
      matchesStatus = acordo.status === statusFilter;
    }
    return matchesSearch && matchesStatus && matchesDateFilter(acordo.id);
  });

  // Acordos Pagos: têm pelo menos 1 parcela paga
  const acordosPagos = filteredAcordos.filter(acordo => acordosComPagamentosPagos.has(acordo.id));

  // Acordos Negociados: não têm nenhuma parcela paga E não têm parcelas vencidas
  const acordosNegociados = filteredAcordos.filter(acordo => !acordosComPagamentosPagos.has(acordo.id) && !acordosComParcelasVencidas.has(acordo.id)).sort((a, b) => {
    if (!a.boleto_enviado && b.boleto_enviado) return -1;
    if (a.boleto_enviado && !b.boleto_enviado) return 1;
    const dataA = a.data_primeiro_pagamento || '';
    const dataB = b.data_primeiro_pagamento || '';
    return dataB.localeCompare(dataA);
  });

  // Acordos Realizados: parcelas vencidas E SEM nenhuma parcela paga
  const acordosRealizados = filteredAcordos
    .filter(acordo => acordosComParcelasVencidas.has(acordo.id) && !acordosComPagamentosPagos.has(acordo.id))
    .sort((a, b) => {
      const dataA = dataVencidaPorAcordo.get(a.id) || '';
      const dataB = dataVencidaPorAcordo.get(b.id) || '';
      return dataB.localeCompare(dataA);
    });

  // Acordos Vencidos: parcelas vencidas E COM pelo menos 1 parcela paga
  const acordosVencidos = filteredAcordos
    .filter(acordo => acordosComParcelasVencidas.has(acordo.id) && acordosComPagamentosPagos.has(acordo.id))
    .sort((a, b) => {
      const dataA = dataVencidaPorAcordo.get(a.id) || '';
      const dataB = dataVencidaPorAcordo.get(b.id) || '';
      return dataB.localeCompare(dataA);
    });

  // Acordos com Parcelas Próximas ao Vencimento
  const acordosProximos = filteredAcordos
    .filter(acordo => acordosComParcelasProximas.has(acordo.id))
    .sort((a, b) => {
      const dataA = dataProximaPorAcordo.get(a.id) || '';
      const dataB = dataProximaPorAcordo.get(b.id) || '';
      return dataA.localeCompare(dataB);
    });
  const acordosExibidos = abaAtiva === 'pagos' ? acordosPagos : abaAtiva === 'proximas' ? acordosProximos : abaAtiva === 'acordos_realizados' ? acordosRealizados : abaAtiva === 'vencidos' ? acordosVencidos : acordosNegociados;
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'default';
      case 'concluido':
        return 'secondary';
      case 'cancelado':
        return 'destructive';
      default:
        return 'outline';
    }
  };
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'Ativo';
      case 'concluido':
        return 'Concluído';
      case 'cancelado':
        return 'Cancelado';
      case 'quebrado':
        return 'Quebrado';
      default:
        return status;
    }
  };

  const handleBulkSend = useCallback(async (acordosList: Acordo[], selectedInstances: WhatsAppInstance[]) => {
    if (!user || selectedInstances.length === 0) {
      console.log('handleBulkSend: no user or no instances selected');
      return;
    }
    const nomeOperador = profile?.nome ? toTitleCase(profile.nome) : 'Operador';
    const templates = lembreteTemplates || [];

    // Fetch pending parcelas for all acordos
    const acordoIds = acordosList.map(a => a.id);
    console.log('handleBulkSend: fetching parcelas for', acordoIds.length, 'acordos');
    
    const { data: parcelas, error: parcelasError } = await supabase
      .from('pagamentos')
      .select('acordo_id, valor_parcela, data_prevista')
      .in('acordo_id', acordoIds)
      .eq('status', 'pendente')
      .order('data_prevista', { ascending: true });

    if (parcelasError) {
      console.error('handleBulkSend: error fetching parcelas', parcelasError);
    }

    // Build map: acordo_id -> first pending parcela
    const parcelaMap = new Map<string, { valor_parcela: number; data_prevista: string }>();
    parcelas?.forEach(p => {
      if (!parcelaMap.has(p.acordo_id)) {
        parcelaMap.set(p.acordo_id, { valor_parcela: p.valor_parcela, data_prevista: p.data_prevista });
      }
    });

    const hojeStr = new Date().toISOString().split('T')[0];
    const queueItems = acordosList
      .filter(acordo => acordo.cliente_telefone) // Ensure phone exists
      .map(acordo => {
        const parcela = parcelaMap.get(acordo.id);
        const dataPrevista = parcela?.data_prevista || acordo.data_primeiro_pagamento;
        let tipo = '3_dias';
        if (dataPrevista < hojeStr) tipo = 'vencido';
        else if (dataPrevista === hojeStr) tipo = 'hoje';

        return {
          id: acordo.id,
          cliente_nome: acordo.cliente_nome,
          cliente_telefone: acordo.cliente_telefone || '',
          valor_parcela: parcela?.valor_parcela || acordo.valor_parcela,
          data_prevista: dataPrevista,
          tipo,
          acordo_id: acordo.id,
        };
      });

    console.log('handleBulkSend: starting send with', queueItems.length, 'items and', selectedInstances.length, 'instances');
    
    if (queueItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum acordo com telefone',
        description: 'Nenhum acordo possui telefone cadastrado para envio.',
      });
      return;
    }

    startSending(queueItems, selectedInstances, templates, nomeOperador);
    toast({
      title: 'Envio em lote iniciado',
      description: `${queueItems.length} mensagens serão enviadas com intervalo de 5-15 minutos.`,
    });
  }, [user, profile, lembreteTemplates, startSending, toast]);
  if (loading) {
    return <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>;
  }
  return <AppLayout>
      <Collapsible open={rankingAberto} onOpenChange={setRankingAberto}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
         <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Meus Acordos</h1>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Funcionário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcionarios?.map((f) => (
                  <SelectItem key={f.user_id} value={f.user_id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-sm py-1 px-3">
              <TrendingUp className="h-4 w-4 mr-1" />
              {acordosHoje ?? 0} acordo(s) hoje
            </Badge>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Trophy className="h-4 w-4" />
                Ranking
              </Button>
            </CollapsibleTrigger>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExportarExcel(acordosExibidos)} disabled={acordosExibidos.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
            <Button asChild>
              <Link to="/acordos/novo">
                <PlusCircle className="h-4 w-4 mr-2" />
                Novo Acordo
              </Link>
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <RankingMensal />
        </CollapsibleContent>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-[220px] justify-start text-left font-normal",
                  !filtroDataVencimento && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filtroDataVencimento ? format(filtroDataVencimento, "dd/MM/yyyy") : "Filtrar por vencimento"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filtroDataVencimento}
                onSelect={setFiltroDataVencimento}
                locale={ptBR}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {filtroDataVencimento && (
            <Button variant="ghost" size="icon" onClick={() => setFiltroDataVencimento(undefined)} title="Limpar filtro de data">
              <X className="h-4 w-4" />
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
              <SelectItem value="quebrado">Quebrados</SelectItem>
              <SelectItem value="duplicados">Duplicados (CPF)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Abas de acordos */}
        <Tabs value={abaAtiva} onValueChange={v => setAbaAtiva(v as 'pagos' | 'negociados' | 'proximas' | 'acordos_realizados' | 'vencidos')}>
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="negociados">
              Negociados ({acordosNegociados.length})
            </TabsTrigger>
            <TabsTrigger value="pagos">
              Pagos ({acordosPagos.length})
            </TabsTrigger>
            <TabsTrigger value="proximas">
              Próximas ao Vencimento ({acordosProximos.length})
            </TabsTrigger>
            <TabsTrigger value="acordos_realizados">
              Acordos Realizados ({acordosRealizados.length})
            </TabsTrigger>
            <TabsTrigger value="vencidos">
              Vencidas ({acordosVencidos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="negociados">
            {acordosNegociados.length > 0 ? <div className="grid gap-4">
                {acordosNegociados.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onDelete={() => setAcordoParaExcluir(acordo)} onEnviarWhatsApp={handleEnviarWhatsApp} enviandoWhatsApp={enviandoWhatsApp} getStatusVariant={getStatusVariant} getStatusLabel={getStatusLabel} isNegociado={true} isVencido={acordosComParcelasVencidas.has(acordo.id)} isQuebraAcordo={acordosComQuebraAcordo.has(acordo.id)} envioStatus={statusMap[acordo.id]} cpfDuplicadoOutros={getCpfDuplicadoOutros(acordo)} />)}
              </div> : <EmptyState search={search} statusFilter={statusFilter} />}
          </TabsContent>

          <TabsContent value="pagos">
            {acordosPagos.length > 0 ? <div className="grid gap-4">
                {acordosPagos.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onDelete={() => setAcordoParaExcluir(acordo)} onEnviarWhatsApp={handleEnviarWhatsApp} enviandoWhatsApp={enviandoWhatsApp} getStatusVariant={getStatusVariant} getStatusLabel={getStatusLabel} isQuebraAcordo={acordosComQuebraAcordo.has(acordo.id)} envioStatus={statusMap[acordo.id]} cpfDuplicadoOutros={getCpfDuplicadoOutros(acordo)} />)}
              </div> : <EmptyState search={search} statusFilter={statusFilter} message="Nenhum acordo com pagamentos realizados" />}
          </TabsContent>

          <TabsContent value="proximas">
            <BulkSendPanel
              acordos={acordosProximos}
              instances={whatsappInstances || []}
              templates={lembreteTemplates || []}
              operadorNome={profile?.nome ? toTitleCase(profile.nome) : 'Operador'}
              isSending={isSending}
              onStartSending={handleBulkSend}
              onCancelSending={cancelSending}
            />
            {acordosProximos.length > 0 ? <div className="grid gap-4">
                {acordosProximos.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onDelete={() => setAcordoParaExcluir(acordo)} onEnviarWhatsApp={handleEnviarWhatsApp} enviandoWhatsApp={enviandoWhatsApp} getStatusVariant={getStatusVariant} getStatusLabel={getStatusLabel} isQuebraAcordo={acordosComQuebraAcordo.has(acordo.id)} envioStatus={statusMap[acordo.id]} cpfDuplicadoOutros={getCpfDuplicadoOutros(acordo)} />)}
              </div> : <EmptyState search={search} statusFilter={statusFilter} message="Nenhuma parcela próxima ao vencimento" />}
          </TabsContent>

          <TabsContent value="acordos_realizados">
            <BulkSendPanel
              acordos={acordosRealizados}
              instances={whatsappInstances || []}
              templates={lembreteTemplates || []}
              operadorNome={profile?.nome ? toTitleCase(profile.nome) : 'Operador'}
              isSending={isSending}
              onStartSending={handleBulkSend}
              onCancelSending={cancelSending}
            />
            {acordosRealizados.length > 0 ? <div className="grid gap-4">
                {acordosRealizados.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onDelete={() => setAcordoParaExcluir(acordo)} onEnviarWhatsApp={handleEnviarWhatsApp} enviandoWhatsApp={enviandoWhatsApp} getStatusVariant={getStatusVariant} getStatusLabel={getStatusLabel} isQuebraAcordo={acordosComQuebraAcordo.has(acordo.id)} envioStatus={statusMap[acordo.id]} cpfDuplicadoOutros={getCpfDuplicadoOutros(acordo)} />)}
              </div> : <EmptyState search={search} statusFilter={statusFilter} message="Nenhum acordo realizado sem pagamentos" />}
          </TabsContent>

          <TabsContent value="vencidos">
            <BulkSendPanel
              acordos={acordosVencidos}
              instances={whatsappInstances || []}
              templates={lembreteTemplates || []}
              operadorNome={profile?.nome ? toTitleCase(profile.nome) : 'Operador'}
              isSending={isSending}
              onStartSending={handleBulkSend}
              onCancelSending={cancelSending}
            />
            {acordosVencidos.length > 0 ? <div className="grid gap-4">
                {acordosVencidos.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onDelete={() => setAcordoParaExcluir(acordo)} onEnviarWhatsApp={handleEnviarWhatsApp} enviandoWhatsApp={enviandoWhatsApp} getStatusVariant={getStatusVariant} getStatusLabel={getStatusLabel} isQuebraAcordo={acordosComQuebraAcordo.has(acordo.id)} envioStatus={statusMap[acordo.id]} cpfDuplicadoOutros={getCpfDuplicadoOutros(acordo)} />)}
              </div> : <EmptyState search={search} statusFilter={statusFilter} message="Nenhuma parcela vencida encontrada" />}
          </TabsContent>
        </Tabs>
      </div>
      </Collapsible>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!acordoParaExcluir} onOpenChange={open => !open && setAcordoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir acordo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O acordo com <strong>{acordoParaExcluir?.cliente_nome}</strong> e todas as suas parcelas serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAcordoParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
            if (acordoParaExcluir) {
              handleDelete(acordoParaExcluir.id);
              setAcordoParaExcluir(null);
            }
          }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de seleção de instância WhatsApp */}
      <Dialog open={!!whatsappDialogAcordo} onOpenChange={(open) => !open && setWhatsappDialogAcordo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Enviar WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enviar lembrete para <strong>{whatsappDialogAcordo?.cliente_nome}</strong>
            </p>
            {(whatsappInstances?.length || 0) > 1 ? (
              <div className="space-y-2">
                <Label>Selecione a instância WhatsApp:</Label>
                <RadioGroup value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                  {whatsappInstances?.map((inst) => (
                    <div key={inst.id} className="flex items-center space-x-2 p-2 rounded-md border hover:bg-accent/50 transition-colors">
                      <RadioGroupItem value={inst.id} id={`inst-${inst.id}`} />
                      <Label htmlFor={`inst-${inst.id}`} className="cursor-pointer flex-1">
                        {inst.nome || inst.server_url}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <p className="text-sm">
                Instância: <strong>{whatsappInstances?.[0]?.nome || whatsappInstances?.[0]?.server_url || '—'}</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsappDialogAcordo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarEnvioWhatsApp}
              disabled={!selectedInstanceId || sendingWhatsappDialog}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {sendingWhatsappDialog ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Enviar Mensagem</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>;
}