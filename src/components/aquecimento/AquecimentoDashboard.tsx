import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Clock, MessageCircle, Mic, Image, Smile, CheckCircle, XCircle, Send, AlertTriangle, Camera, UserPlus, TrendingUp, Timer, Users, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DashboardMetrics {
  total: number;
  emAquecimento: number;
  interacoesHoje: number;
  interacoes7d: number;
  taxaSucesso: number;
  agendados: number;
  statusHoje?: number;
  statusTotal?: number;
  contatosSalvosMes?: number;
}

interface ActiveInstance {
  id: string;
  instancia_id: string;
  instance_name: string;
  fase: number;
  status: string;
  interacoes_hoje: number;
  limite_diario: number;
  ultima_interacao: string | null;
  ultima_msg_conteudo?: string;
  ultima_msg_hora?: string;
  ultima_msg_tipo?: string;
  proximo_agendamento?: string;
  em_carencia?: boolean;
  dias_conectado?: number;
}

interface TimelineItem {
  id: string;
  tipo: string;
  tipo_interacao?: string;
  conteudo: string | null;
  status: string;
  enviado_em: string | null;
  origem_nome: string;
  destino_nome: string;
}

interface ConversaHoje {
  id: string;
  origem_nome: string;
  destino_nome: string;
  total_trocas: number;
  max_trocas: number;
  status: string;
  inicio_em: string;
}

interface Props {
  metrics: DashboardMetrics;
}

function getBrasiliaTime() {
  const now = new Date();
  const brOffset = -3;
  return new Date(now.getTime() + (brOffset * 60 + now.getTimezoneOffset()) * 60000);
}

function getNextCronSlot(horaInicio: number, horaFim: number, diasAtivos: number[]): { time: string; isActive: boolean; isToday: boolean; nextDate: Date | null } {
  const brNow = getBrasiliaTime();
  const currentHour = brNow.getHours();
  const currentMin = brNow.getMinutes();
  const currentDay = brNow.getDay();

  const isActiveDay = diasAtivos.includes(currentDay);

  if (isActiveDay && (currentHour < horaFim || (currentHour === horaFim && currentMin === 0))) {
    if (currentHour >= horaInicio) {
      let nextMin = currentMin < 30 ? 30 : 0;
      let nextHour = currentMin < 30 ? currentHour : currentHour + 1;
      if (nextHour > horaFim || (nextHour === horaFim && nextMin > 0)) {
        return findNextActiveDay(diasAtivos, horaInicio, brNow);
      }
      const nextDate = new Date(brNow);
      nextDate.setHours(nextHour, nextMin, 0, 0);
      return { time: `${String(nextHour).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`, isActive: true, isToday: true, nextDate };
    } else {
      const nextDate = new Date(brNow);
      nextDate.setHours(horaInicio, 0, 0, 0);
      return { time: `${String(horaInicio).padStart(2, '0')}:00`, isActive: false, isToday: true, nextDate };
    }
  }

  return findNextActiveDay(diasAtivos, horaInicio, brNow);
}

function findNextActiveDay(diasAtivos: number[], horaInicio: number, brNow: Date): { time: string; isActive: boolean; isToday: boolean; nextDate: Date | null } {
  const currentDay = brNow.getDay();
  for (let i = 1; i <= 7; i++) {
    const nextDay = (currentDay + i) % 7;
    if (diasAtivos.includes(nextDay)) {
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const nextDate = new Date(brNow);
      nextDate.setDate(nextDate.getDate() + i);
      nextDate.setHours(horaInicio, 0, 0, 0);
      return { time: `${dayNames[nextDay]} às ${String(horaInicio).padStart(2, '0')}:00`, isActive: false, isToday: false, nextDate };
    }
  }
  return { time: 'Não configurado', isActive: false, isToday: false, nextDate: null };
}

function CountdownTimer({ targetDate }: { targetDate: Date | null }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!targetDate) { setRemaining('--'); return; }
    const tick = () => {
      const now = getBrasiliaTime();
      const diff = targetDate.getTime() - now.getTime();
      if (diff <= 0) { setRemaining('Agora!'); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        setRemaining(`${hrs}h ${String(m).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`);
      } else {
        setRemaining(`${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <span className="font-mono text-sm font-bold text-orange-500">{remaining}</span>
  );
}

function tipoIcon(tipo: string, tipoInteracao?: string) {
  if (tipoInteracao === 'status') return <Camera className="h-3.5 w-3.5 text-purple-500" />;
  if (tipoInteracao === 'contato_salvo') return <UserPlus className="h-3.5 w-3.5 text-cyan-500" />;
  switch (tipo) {
    case 'texto': return <MessageCircle className="h-3.5 w-3.5" />;
    case 'audio': return <Mic className="h-3.5 w-3.5" />;
    case 'imagem': return <Image className="h-3.5 w-3.5" />;
    case 'sticker': return <Smile className="h-3.5 w-3.5" />;
    default: return <MessageCircle className="h-3.5 w-3.5" />;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'RESPONDIDO': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    case 'ENTREGUE': return <Send className="h-3.5 w-3.5 text-blue-500" />;
    case 'ENVIADO': return <Send className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'FALHOU': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function AquecimentoDashboard({ metrics }: Props) {
  const [activeInstances, setActiveInstances] = useState<ActiveInstance[]>([]);
  const [aguardandoMaturacao, setAguardandoMaturacao] = useState<{ nome: string; dias_restantes: number }[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [conversasHoje, setConversasHoje] = useState<ConversaHoje[]>([]);
  const [nextCron, setNextCron] = useState<{ time: string; isActive: boolean; isToday: boolean; nextDate: Date | null }>({ time: '', isActive: false, isToday: false, nextDate: null });
  const [loading, setLoading] = useState(true);
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false);
  const [sincronizandoAgenda, setSincronizandoAgenda] = useState(false);
  const [sincronizandoTelefones, setSincronizandoTelefones] = useState(false);

  const sincronizarTelefonesInstancias = async () => {
    setSincronizandoTelefones(true);
    try {
      toast.info('Buscando telefones das instâncias e arquivando conversas internas...');
      const { data, error } = await supabase.functions.invoke('backfill-instance-phones');
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Telefones: ${data.updated} atualizados, ${data.skipped} já tinham, ${data.failed} falharam. Conversas internas arquivadas: ${data.arquivados ?? 0}`);
      } else {
        toast.error(`Falha: ${data?.error || 'erro desconhecido'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSincronizandoTelefones(false);
    }
  };

  const enviarRelatorioAgora = async () => {
    setEnviandoRelatorio(true);
    try {
      const { data, error } = await supabase.functions.invoke('daily-report-advanced');
      if (error) throw error;
      if (data?.success) {
        toast.success(`Relatório enviado via ${data.instancia || 'instância'} ✅`);
      } else {
        toast.error(`Falha no envio: ${data?.erro || 'erro desconhecido'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setEnviandoRelatorio(false);
    }
  };

  const sincronizarAgendaFisica = async () => {
    setSincronizandoAgenda(true);
    try {
      toast.info('Sincronizando agenda física... pode levar alguns minutos');
      const { data, error } = await supabase.functions.invoke('aquecimento-sync-contatos-agenda', {
        body: { limite: 300 },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Agenda sincronizada: ${data.salvos} novos, ${data.pulos} já existentes, ${data.erros} erros`);
      } else {
        toast.error(`Falha: ${data?.error || 'erro desconhecido'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSincronizandoAgenda(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [metrics.emAquecimento]);

  // Refresh nextCron every 30 seconds so countdown stays accurate across slot boundaries
  const [horaConfig, setHoraConfig] = useState<{ inicio: number; fim: number; dias: number[] } | null>(null);
  useEffect(() => {
    if (!horaConfig) return;
    const interval = setInterval(() => {
      setNextCron(getNextCronSlot(horaConfig.inicio, horaConfig.fim, horaConfig.dias));
    }, 30000);
    return () => clearInterval(interval);
  }, [horaConfig]);

  async function loadDashboardData() {
    setLoading(true);

    const [configRes, instancesRes, allInstancesRes, maturacaoRes] = await Promise.all([
      supabase.from('whatsapp_aquecimento_config' as any).select('chave, valor'),
      supabase.from('whatsapp_aquecimento_instancias' as any).select('*').eq('status', 'EM_AQUECIMENTO'),
      supabase.from('user_whatsapp_instances').select('id, nome, criado_em'),
      supabase.from('whatsapp_aquecimento_instancias' as any).select('instancia_id').eq('status', 'AGUARDANDO_MATURACAO'),
    ]);

    const configs = (configRes.data as any[]) || [];
    const getConfigVal = (key: string, def: any) => {
      const found = configs.find((c: any) => c.chave === key);
      return found ? found.valor : def;
    };
    const horarioComercial = getConfigVal('horario_comercial', { inicio: '08:00', fim: '18:00' });
    const diasAtivos = getConfigVal('dias_ativos', [1, 2, 3, 4, 5, 6]);

    const parseHour = (val: any) => typeof val === 'string' ? parseInt(val.split(':')[0], 10) : Number(val);
    const hInicio = parseHour(horarioComercial.inicio);
    const hFim = parseHour(horarioComercial.fim);
    setHoraConfig({ inicio: hInicio, fim: hFim, dias: diasAtivos });
    setNextCron(getNextCronSlot(hInicio, hFim, diasAtivos));

    const instanceNameMap = new Map((allInstancesRes.data || []).map((i: any) => [i.id, i.nome || 'Sem nome']));
    const activeData = (instancesRes.data as any[]) || [];

    // Build maturação list (instances aguardando 5 dias)
    const maturacaoList = ((maturacaoRes.data as any[]) || []).map((m: any) => {
      const inst = (allInstancesRes.data || []).find((i: any) => i.id === m.instancia_id) as any;
      if (!inst) return null;
      const idadeDias = (Date.now() - new Date(inst.criado_em).getTime()) / 86400000;
      const dias_restantes = Math.max(0, Math.ceil(5 - idadeDias));
      return { nome: inst.nome || 'Sem nome', dias_restantes };
    }).filter(Boolean) as { nome: string; dias_restantes: number }[];
    setAguardandoMaturacao(maturacaoList);

    if (activeData.length === 0) {
      setActiveInstances([]);
      setTimeline([]);
      setLoading(false);
      return;
    }

    const activeIds = activeData.map((a: any) => a.instancia_id);

    const today = new Date().toISOString().split('T')[0];
    const [interacoesRes, agendamentosRes] = await Promise.all([
      supabase
        .from('whatsapp_aquecimento_interacoes' as any)
        .select('*')
        .in('instancia_origem_id', activeIds)
        .gte('enviado_em', today)
        .order('enviado_em', { ascending: false })
        .limit(50),
      supabase
        .from('whatsapp_aquecimento_agendamentos' as any)
        .select('*')
        .eq('status', 'AGENDADO')
        .in('instancia_origem_id', activeIds)
        .order('agendado_para', { ascending: true })
        .limit(20),
    ]);

    const interacoes = (interacoesRes.data as any[]) || [];
    const agendamentos = (agendamentosRes.data as any[]) || [];

    const instanceCreatedMap = new Map((allInstancesRes.data || []).map((i: any) => [i.id, i.criado_em]));

    // Build list of possible targets (other active instances) for each instance
    const mapped: ActiveInstance[] = activeData.map((inst: any, idx: number) => {
      const lastInteraction = interacoes.find((i: any) => i.instancia_origem_id === inst.instancia_id);
      const nextSchedule = agendamentos.find((a: any) => a.instancia_origem_id === inst.instancia_id);
      const criado_em = instanceCreatedMap.get(inst.instancia_id);
      const diasConectado = criado_em ? Math.floor((Date.now() - new Date(criado_em).getTime()) / 86400000) : 999;

      // Estimate target: the next active instance in the list (round-robin)
      const otherActive = activeData.filter((a: any) => a.instancia_id !== inst.instancia_id);
      const estimatedTarget = otherActive.length > 0
        ? instanceNameMap.get(otherActive[idx % otherActive.length]?.instancia_id) || null
        : null;

      return {
        id: inst.id,
        instancia_id: inst.instancia_id,
        instance_name: instanceNameMap.get(inst.instancia_id) || 'Sem nome',
        fase: inst.fase,
        status: inst.status,
        interacoes_hoje: inst.interacoes_hoje,
        limite_diario: inst.limite_diario,
        ultima_interacao: inst.ultima_interacao,
        ultima_msg_conteudo: lastInteraction?.conteudo || null,
        ultima_msg_hora: lastInteraction?.enviado_em || null,
        ultima_msg_tipo: lastInteraction?.tipo || null,
        proximo_agendamento: nextSchedule?.agendado_para || null,
        em_carencia: diasConectado < 2,
        dias_conectado: diasConectado,
        estimatedTarget,
      } as ActiveInstance & { estimatedTarget: string | null };
    });

    setActiveInstances(mapped);

    const timelineData: TimelineItem[] = interacoes.slice(0, 10).map((i: any) => ({
      id: i.id,
      tipo: i.tipo,
      tipo_interacao: i.tipo_interacao || 'mensagem',
      conteudo: i.conteudo,
      status: i.status,
      enviado_em: i.enviado_em,
      origem_nome: instanceNameMap.get(i.instancia_origem_id) || '?',
      destino_nome: instanceNameMap.get(i.instancia_destino_id) || '?',
    }));

    setTimeline(timelineData);

    // Load today's AI conversations
    const todayConv = new Date().toISOString().split('T')[0];
    const { data: conversasData } = await supabase
      .from('whatsapp_conversas_ia' as any)
      .select('id, instancia_origem_id, instancia_destino_id, total_trocas, max_trocas, status, inicio_em')
      .gte('inicio_em', todayConv)
      .in('status', ['ATIVA', 'FINALIZADA'])
      .order('inicio_em', { ascending: false });

    const conversasMapped: ConversaHoje[] = (conversasData || []).map((c: any) => ({
      id: c.id,
      origem_nome: instanceNameMap.get(c.instancia_origem_id) || '?',
      destino_nome: instanceNameMap.get(c.instancia_destino_id) || '?',
      total_trocas: c.total_trocas,
      max_trocas: c.max_trocas,
      status: c.status,
      inicio_em: c.inicio_em,
    }));
    setConversasHoje(conversasMapped);

    setLoading(false);
  }

  const faseLabel = (fase: number) => {
    const labels: Record<number, string> = { 1: 'Fase 1 — Iniciante', 2: 'Fase 2 — Crescimento', 3: 'Fase 3 — Maturação', 4: 'Fase 4 — Consolidação' };
    return labels[fase] || `Fase ${fase}`;
  };

  return (
    <div className="space-y-4">
      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Números</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em Aquecimento</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-500">{metrics.emAquecimento}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Interações Hoje</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.interacoesHoje}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Interações 7 dias</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.interacoes7d}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa Sucesso</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.taxaSucesso}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Agendados</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-500">{metrics.agendados}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Status Hoje</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-purple-500">{metrics.statusHoje ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Contatos Salvos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-cyan-500">{metrics.contatosSalvosMes ?? 0}<span className="text-xs text-muted-foreground ml-1">este mês</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Reputação</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{Math.min(100, Math.round(((metrics.statusHoje ?? 0) * 2 + (metrics.contatosSalvosMes ?? 0) * 0.5 + metrics.taxaSucesso) / 3))}%</div></CardContent></Card>
      </div>

      {/* Botões de ação manual */}
      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          onClick={sincronizarAgendaFisica}
          disabled={sincronizandoAgenda}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {sincronizandoAgenda ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {sincronizandoAgenda ? 'Sincronizando...' : 'Sincronizar agenda física'}
        </Button>
        <Button
          onClick={enviarRelatorioAgora}
          disabled={enviandoRelatorio}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {enviandoRelatorio ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {enviandoRelatorio ? 'Enviando...' : 'Enviar relatório agora (62991672674)'}
        </Button>
        <Button
          onClick={sincronizarTelefonesInstancias}
          disabled={sincronizandoTelefones}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Busca os telefones das instâncias na UAZAPI e arquiva no Inbox conversas entre números da própria casa"
        >
          {sincronizandoTelefones ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {sincronizandoTelefones ? 'Sincronizando...' : 'Sincronizar telefones (arquivar internos)'}
        </Button>
      </div>

      {/* Status Banner */}
      {metrics.emAquecimento > 0 ? (
        <Card className={nextCron.isActive ? 'border-green-500/50 bg-green-500/5' : 'border-yellow-500/50 bg-yellow-500/5'}>
          <CardContent className="py-4 flex items-center gap-3">
            {nextCron.isActive ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-green-600 dark:text-green-400">Sistema Ativo</span>
                  <span className="text-muted-foreground">— próxima execução em</span>
                  <CountdownTimer targetDate={nextCron.nextDate} />
                  <span className="text-muted-foreground text-sm">(às {nextCron.time})</span>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">Fora do horário comercial</span>
                  <span className="text-muted-foreground">— próxima execução em</span>
                  <CountdownTimer targetDate={nextCron.nextDate} />
                  <span className="text-muted-foreground text-sm">({nextCron.time})</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-muted bg-muted/30">
          <CardContent className="py-4 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="relative inline-flex rounded-full h-3 w-3 bg-muted-foreground/40"></span>
            </span>
            <span className="text-muted-foreground">Nenhum número em aquecimento. Vá na aba <strong>Números</strong> para iniciar.</span>
          </CardContent>
        </Card>
      )}

      {/* Aguardando maturação (5 dias) */}
      {aguardandoMaturacao.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
              ⏳ Aguardando maturação ({aguardandoMaturacao.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Números novos só entram na fila de aquecimento após 5 dias da conexão (anti-ban).
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {aguardandoMaturacao.map((m, i) => (
                <Badge key={i} variant="outline" className="text-[11px] border-yellow-500/50">
                  {m.nome} — faltam {m.dias_restantes}d
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Instance Cards */}
      {activeInstances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeInstances.map(inst => {
            const progressPct = inst.limite_diario > 0 ? Math.round((inst.interacoes_hoje / inst.limite_diario) * 100) : 0;
            const limitReached = inst.interacoes_hoje >= inst.limite_diario;
            const estimatedTarget = (inst as any).estimatedTarget as string | null;
            return (
              <Card key={inst.id} className={limitReached ? 'border-green-500/30' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{inst.instance_name}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      {inst.em_carencia && (
                        <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600 dark:text-yellow-400">
                          ⏳ Em carência ({inst.dias_conectado ?? 0}d)
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{faseLabel(inst.fase)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progresso do dia</span>
                      <span className="font-medium">{inst.interacoes_hoje}/{inst.limite_diario} mensagens</span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                  </div>

                  {/* Last message */}
                  <div className="text-sm space-y-1">
                    {inst.ultima_msg_hora ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span>
                          Última msg: <strong>{format(new Date(inst.ultima_msg_hora), 'HH:mm')}</strong>
                          {inst.ultima_msg_conteudo && (
                            <span className="ml-1 text-xs">— {inst.ultima_msg_conteudo.length > 40 ? inst.ultima_msg_conteudo.slice(0, 40) + '…' : inst.ultima_msg_conteudo}</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>Nenhuma mensagem enviada hoje</span>
                      </div>
                    )}

                    {/* Countdown timer with target */}
                    {limitReached ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs font-medium">Limite diário atingido ✓</span>
                      </div>
                    ) : inst.proximo_agendamento ? (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/20">
                        <Timer className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Próxima msg em</span>
                            <CountdownTimer targetDate={new Date(inst.proximo_agendamento)} />
                          </div>
                          {estimatedTarget && (
                            <span className="text-[11px] text-muted-foreground">
                              → para <strong>{estimatedTarget}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ) : nextCron.isActive ? (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/20">
                        <Timer className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Próxima msg em</span>
                            <CountdownTimer targetDate={nextCron.nextDate} />
                          </div>
                          {estimatedTarget && (
                            <span className="text-[11px] text-muted-foreground">
                              → para <strong>{estimatedTarget}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">Fora do horário — retoma {nextCron.time}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Conversas de Hoje */}
      {conversasHoje.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Conversas de Hoje ({conversasHoje.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {conversasHoje.map(conv => (
                <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                      <span className="truncate">{conv.origem_nome}</span>
                      <span className="text-muted-foreground shrink-0">↔</span>
                      <span className="truncate">{conv.destino_nome}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(new Date(conv.inicio_em), 'HH:mm')}</span>
                      <span>•</span>
                      <span>{conv.total_trocas}/{conv.max_trocas} trocas</span>
                    </div>
                  </div>
                  <Badge variant={conv.status === 'FINALIZADA' ? 'default' : 'secondary'} className="text-[10px] shrink-0 ml-2">
                    {conv.status === 'FINALIZADA' ? '✓ Finalizada' : '⏳ Ativa'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atividade de Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {timeline.map(item => (
                <div key={item.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-1.5 shrink-0 w-14 text-xs text-muted-foreground">
                    {item.enviado_em ? format(new Date(item.enviado_em), 'HH:mm') : '--:--'}
                  </div>
                  <div className="shrink-0">{tipoIcon(item.tipo, item.tipo_interacao)}</div>
                  <div className="truncate flex-1 text-muted-foreground">
                    {item.tipo_interacao === 'status' ? (
                      <><span className="font-medium text-foreground">{item.origem_nome}</span><span className="ml-1 text-xs text-purple-500">📸 postou status</span></>
                    ) : item.tipo_interacao === 'contato_salvo' ? (
                      <><span className="font-medium text-foreground">{item.origem_nome}</span><span className="ml-1 text-xs text-cyan-500">📇 salvou contato</span></>
                    ) : (
                      <><span className="font-medium text-foreground">{item.origem_nome}</span><span className="mx-1">→</span><span className="font-medium text-foreground">{item.destino_nome}</span></>
                    )}
                    {item.conteudo && (
                      <span className="ml-2 text-xs">"{item.conteudo.length > 30 ? item.conteudo.slice(0, 30) + '…' : item.conteudo}"</span>
                    )}
                  </div>
                  <div className="shrink-0">{statusIcon(item.status)}</div>
                  <Badge variant={item.status === 'RESPONDIDO' ? 'default' : item.status === 'FALHOU' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}