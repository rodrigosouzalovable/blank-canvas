import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, Phone, Activity, Clock, CheckCircle, Play, Pause, BarChart3, List, RefreshCw, Zap, PlayCircle, FlaskConical, Timer, Settings } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import AquecimentoNotificacoes from '@/components/aquecimento/AquecimentoNotificacoes';
import AquecimentoConfigTab from '@/components/aquecimento/AquecimentoConfigTab';
import AquecimentoAutoSaveTab from '@/components/aquecimento/AquecimentoAutoSaveTab';
import { format } from 'date-fns';

interface AquecimentoInstancia {
  id: string;
  instancia_id: string;
  status: string;
  fase: number;
  fase_auto: boolean;
  dias_na_fase: number;
  interacoes_hoje: number;
  interacoes_total: number;
  respostas_recebidas: number;
  limite_diario: number;
  ultima_interacao: string | null;
  instance_name?: string;
  dias_conectado?: number;
}

interface Interacao {
  id: string;
  tipo: string;
  conteudo: string | null;
  conteudo_resposta: string | null;
  status: string;
  enviado_em: string | null;
  respondido_em: string | null;
  tempo_resposta_segundos: number | null;
  instancia_origem_id: string;
  instancia_destino_id: string;
  origem_nome?: string;
  destino_nome?: string;
}

const PHASE_LABELS: Record<number, string> = {
  1: 'Fase 1 — Iniciante (3/dia)',
  2: 'Fase 2 — Crescimento (10/dia)',
  3: 'Fase 3 — Maturação (20/dia)',
  4: 'Fase 4 — Consolidação (30/dia)',
  5: 'AQUECIDO ✅ (50/dia)',
};

const PHASE_DAYS: Record<number, number> = { 1: 7, 2: 14, 3: 21, 4: 28, 5: 28 };

// === Helper functions for countdown ===
function getBrasiliaTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 3 * 3600000);
}

function getNextCronSlot(horaInicio: number, horaFim: number, diasAtivos: number[]): Date | null {
  const brasilia = getBrasiliaTime();
  const h = brasilia.getHours();
  const m = brasilia.getMinutes();
  const dow = brasilia.getDay(); // 0=Sun

  // Check if today is active
  if (diasAtivos.includes(dow) && (h < horaFim || (h === horaFim && m === 0))) {
    // Still within today's window
    let nextH = h;
    let nextM = m < 30 ? 30 : 0;
    if (m >= 30) nextH++;

    if (nextH < horaInicio) {
      nextH = horaInicio;
      nextM = 0;
    }
    if (nextH < horaFim || (nextH === horaFim && nextM === 0)) {
      const target = new Date(brasilia);
      target.setHours(nextH, nextM, 0, 0);
      // Convert back to local time
      const utcTarget = target.getTime() + 3 * 3600000;
      return new Date(utcTarget - new Date().getTimezoneOffset() * 60000);
    }
  }

  // Find next active day
  for (let d = 1; d <= 7; d++) {
    const nextDow = (dow + d) % 7;
    if (diasAtivos.includes(nextDow)) {
      const target = new Date(brasilia);
      target.setDate(target.getDate() + d);
      target.setHours(horaInicio, 0, 0, 0);
      const utcTarget = target.getTime() + 3 * 3600000;
      return new Date(utcTarget - new Date().getTimezoneOffset() * 60000);
    }
  }
  return null;
}

function CountdownTimer({ targetDate }: { targetDate: Date | null }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Agora!');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!targetDate) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-xs font-mono font-semibold text-orange-400">{timeLeft}</span>;
}

export default function Aquecimento() {
  const { isAdmin } = useUserRole();
  const [instancias, setInstancias] = useState<AquecimentoInstancia[]>([]);
  const [allInstances, setAllInstances] = useState<any[]>([]);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'config' | 'autosave'>('dashboard');
  const [logFilterStatus, setLogFilterStatus] = useState<string>('todos');
  const [logFilterDate, setLogFilterDate] = useState<string>('');
  const [metrics, setMetrics] = useState({ total: 0, emAquecimento: 0, aquecidos: 0, interacoesHoje: 0, taxaSucesso: 0, porFase: {} as Record<number, number>, statusHoje: 0, contatosSalvosMes: 0 });
  const [manualTestOpen, setManualTestOpen] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [nextCronSlot, setNextCronSlot] = useState<Date | null>(null);
  const [isWithinHours, setIsWithinHours] = useState(false);
  const [estimatedTargets, setEstimatedTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, []);

  // Load aquecimento config and compute next cron slot
  useEffect(() => {
    async function loadCronConfig() {
      const { data: configs } = await supabase
        .from('whatsapp_aquecimento_config' as any)
        .select('chave, valor');
      
      let horaInicio = 6, horaFim = 18, diasAtivos = [1, 2, 3, 4, 5, 6];
      if (configs) {
        for (const c of configs as any[]) {
          if (c.chave === 'hora_inicio') horaInicio = Number(c.valor) || 6;
          if (c.chave === 'hora_fim') horaFim = Number(c.valor) || 18;
          if (c.chave === 'dias_ativos') diasAtivos = Array.isArray(c.valor) ? c.valor : [1,2,3,4,5,6];
        }
      }

      const brasilia = getBrasiliaTime();
      const h = brasilia.getHours();
      const dow = brasilia.getDay();
      const within = diasAtivos.includes(dow) && h >= horaInicio && h < horaFim;
      setIsWithinHours(within);

      const slot = getNextCronSlot(horaInicio, horaFim, diasAtivos);
      setNextCronSlot(slot);
    }
    loadCronConfig();
    const interval = setInterval(() => loadCronConfig(), 60000);
    return () => clearInterval(interval);
  }, []);

  // Estimate round-robin targets
  useEffect(() => {
    const active = instancias.filter(i => i.status === 'EM_AQUECIMENTO' && i.interacoes_hoje < i.limite_diario);
    if (active.length < 2) {
      setEstimatedTargets({});
      return;
    }
    const targets: Record<string, string> = {};
    for (let idx = 0; idx < active.length; idx++) {
      const destIdx = (idx + 1) % active.length;
      targets[active[idx].instancia_id] = active[destIdx].instance_name || '?';
    }
    setEstimatedTargets(targets);
  }, [instancias]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadInstancias(), loadInteracoes(), loadMetrics()]);
    setLoading(false);
  }

  async function loadInstancias() {
    const { data: instances } = await supabase.from('user_whatsapp_instances').select('id, nome, criado_em, ativo');
    setAllInstances(instances || []);

    const activeInstanceIds = (instances || []).filter((i: any) => i.ativo).map((i: any) => i.id);

    const { data } = await supabase.from('whatsapp_aquecimento_instancias' as any).select('*');
    if (data && instances) {
      const mapped = (data as any[])
        .filter((d: any) => activeInstanceIds.includes(d.instancia_id))
        .map((d: any) => {
          const inst = instances.find((i: any) => i.id === d.instancia_id);
          const diasConectado = inst ? Math.floor((Date.now() - new Date(inst.criado_em).getTime()) / 86400000) : 0;
          return {
            ...d,
            instance_name: inst?.nome || 'Sem nome',
            dias_conectado: diasConectado,
          };
        });
      setInstancias(mapped);
    }
  }

  async function loadInteracoes() {
    const { data: instances } = await supabase.from('user_whatsapp_instances').select('id, nome');
    const nameMap = new Map((instances || []).map((i: any) => [i.id, i.nome || 'Sem nome']));

    const { data } = await supabase
      .from('whatsapp_aquecimento_interacoes' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) {
      setInteracoes((data as any[]).map((d: any) => ({
        ...d,
        origem_nome: nameMap.get(d.instancia_origem_id) || '?',
        destino_nome: nameMap.get(d.instancia_destino_id) || '?',
      })));
    }
  }

  async function loadMetrics() {
    // Count only instances that are both ativo=true AND exist in aquecimento table
    const { count: total } = await supabase.from('user_whatsapp_instances').select('id', { count: 'exact', head: true }).eq('ativo', true);
    const { data: aquecData } = await supabase.from('whatsapp_aquecimento_instancias' as any).select('status, fase, instancia_id');
    
    // Filter aquecimento data to only include instances that are still active
    const { data: activeInstances } = await supabase.from('user_whatsapp_instances').select('id').eq('ativo', true);
    const activeIds = new Set((activeInstances || []).map((i: any) => i.id));
    const filteredAquecData = (aquecData || []).filter((a: any) => activeIds.has(a.instancia_id));
    
    const emAquecimento = filteredAquecData.filter((a: any) => a.status === 'EM_AQUECIMENTO').length;
    const aquecidos = filteredAquecData.filter((a: any) => a.status === 'AQUECIDO').length;
    
    const porFase: Record<number, number> = {};
    filteredAquecData.filter((a: any) => a.status === 'EM_AQUECIMENTO').forEach((a: any) => {
      porFase[a.fase] = (porFase[a.fase] || 0) + 1;
    });

    const today = new Date().toISOString().split('T')[0];
    const { count: interacoesHoje } = await supabase.from('whatsapp_aquecimento_interacoes' as any).select('id', { count: 'exact', head: true }).gte('enviado_em', today);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentData } = await supabase.from('whatsapp_aquecimento_interacoes' as any).select('status').gte('enviado_em', sevenDaysAgo);
    const total7d = recentData?.length || 0;
    const sucessos = recentData?.filter((r: any) => ['ENTREGUE', 'RESPONDIDO', 'ENVIADO'].includes(r.status)).length || 0;
    const taxaSucesso = total7d > 0 ? Math.round((sucessos / total7d) * 100) : 0;

    // Status posted today
    const { count: statusHoje } = await supabase.from('whatsapp_aquecimento_status_log' as any).select('id', { count: 'exact', head: true }).gte('postado_em', today).eq('resultado', 'ENVIADO');

    // Contacts saved this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count: contatosSalvosMes } = await supabase.from('whatsapp_aquecimento_interacoes' as any).select('id', { count: 'exact', head: true }).eq('tipo_interacao', 'contato_salvo').gte('enviado_em', monthStart.toISOString());

    setMetrics({
      total: total || 0,
      emAquecimento,
      aquecidos,
      interacoesHoje: interacoesHoje || 0,
      taxaSucesso,
      porFase,
      statusHoje: statusHoje || 0,
      contatosSalvosMes: contatosSalvosMes || 0,
    });
  }

  async function pausarAquecimento(id: string) {
    await supabase.from('whatsapp_aquecimento_instancias' as any).update({ status: 'PAUSADO' } as any).eq('id', id);
    toast.success('Aquecimento pausado');
    await loadAll();
  }

  async function retomarAquecimento(id: string) {
    await supabase.from('whatsapp_aquecimento_instancias' as any).update({ status: 'EM_AQUECIMENTO' } as any).eq('id', id);
    toast.success('Aquecimento retomado');
    await loadAll();
  }

  async function forcarReinicio() {
    await supabase.from('whatsapp_aquecimento_instancias' as any).update({ status: 'EM_AQUECIMENTO' } as any).eq('status', 'PAUSADO');
    toast.success('Todos os números pausados foram reiniciados');
    await loadAll();
  }

  function toggleTestId(id: string) {
    setSelectedTestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function iniciarTesteManual() {
    if (selectedTestIds.length < 2) {
      toast.error('Selecione pelo menos 2 instâncias');
      return;
    }
    setTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-aquecimento', {
        body: { action: 'manual-test', instance_ids: selectedTestIds },
      });
      if (error) throw error;
      toast.success(`Teste iniciado! ${data?.enviados || 0} mensagem(ns) enviada(s)`);
      setManualTestOpen(false);
      setSelectedTestIds([]);
      await loadAll();
    } catch (err: any) {
      toast.error('Erro ao iniciar teste: ' + (err.message || err));
    } finally {
      setTestLoading(false);
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      'EM_AQUECIMENTO': 'bg-green-500/20 text-green-400 border-green-500/30',
      'PAUSADO': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'AQUECIDO': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'BLOQUEADO': 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return <Badge className={map[status] || 'bg-muted text-muted-foreground'}>{status}</Badge>;
  };

  const emAquecimentoInstances = instancias.filter(i => i.status === 'EM_AQUECIMENTO');
  const pausadoInstances = instancias.filter(i => i.status === 'PAUSADO');
  const aquecidoInstances = instancias.filter(i => i.status === 'AQUECIDO');

  // Numbers close to being warmed (phase 4, sorted by days connected desc)
  const proximosAquecer = emAquecimentoInstances
    .filter(i => i.fase >= 3)
    .sort((a, b) => (b.dias_conectado || 0) - (a.dias_conectado || 0))
    .slice(0, 5);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold">🤖 Aquecimento Automático</h1>
              <p className="text-muted-foreground text-sm">Sistema 100% automático — números são detectados e aquecidos sem configuração</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
              <Button variant="outline" size="sm" onClick={() => setManualTestOpen(true)} className="gap-1">
                <FlaskConical className="h-4 w-4" /> Teste IA Manual
              </Button>
            {isAdmin && pausadoInstances.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <PlayCircle className="h-4 w-4" /> Reativar Todos ({pausadoInstances.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reativar todos os números?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso vai reativar {pausadoInstances.length} número(s) pausado(s) e retomar o aquecimento automático.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={forcarReinicio}>Reativar Todos</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'dashboard' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('dashboard')}
            className="gap-1"
          >
            <BarChart3 className="h-4 w-4" /> Dashboard
          </Button>
          <Button
            variant={activeTab === 'log' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('log')}
            className="gap-1"
          >
            <List className="h-4 w-4" /> Log de Interações
          </Button>
          <Button
            variant={activeTab === 'config' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('config')}
            className="gap-1"
          >
            <Settings className="h-4 w-4" /> Configuração
          </Button>
          <Button
            variant={activeTab === 'autosave' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('autosave')}
            className="gap-1"
          >
            <Phone className="h-4 w-4" /> Contatos Auto-Save
          </Button>
        </div>

        {activeTab === 'config' && <AquecimentoConfigTab />}
        {activeTab === 'autosave' && <AquecimentoAutoSaveTab />}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Números Conectados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Em Aquecimento</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-500">{metrics.emAquecimento}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {Object.entries(metrics.porFase).map(([f, c]) => `F${f}: ${c}`).join(' | ') || '-'}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Aquecidos ✅</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">{metrics.aquecidos}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Interações Hoje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.interacoesHoje}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Sucesso (7d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.taxaSucesso}%</div>
                </CardContent>
              </Card>
            </div>

            {/* Próximos a aquecer */}
            {proximosAquecer.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Próximos Números a Aquecer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {proximosAquecer.map(inst => {
                      const diasFaltam = Math.max(0, 28 - (inst.dias_conectado || 0));
                      const progressPct = Math.min(100, Math.round(((inst.dias_conectado || 0) / 28) * 100));
                      return (
                        <div key={inst.id} className="flex items-center gap-4 py-2">
                          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">{inst.instance_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {diasFaltam === 0 ? 'Pronto!' : `faltam ${diasFaltam} dias`}
                              </span>
                            </div>
                            <Progress value={progressPct} className="h-2" />
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">Fase {inst.fase}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main grid: Instances + Notifications */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Instances List */}
              <div className="lg:col-span-2 space-y-4">
                {/* Aquecidos */}
                {aquecidoInstances.length > 0 && (
                  <Card className="border-green-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-green-500">✅ Números Aquecidos ({aquecidoInstances.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {aquecidoInstances.map(inst => (
                          <Badge key={inst.id} className="bg-green-500/20 text-green-400 border-green-500/30 text-sm py-1 px-3">
                            📱 {inst.instance_name} — {inst.dias_conectado}d
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Status Banner */}
                {emAquecimentoInstances.length > 0 && (
                  <Card className={`border ${isWithinHours ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Timer className={`h-4 w-4 ${isWithinHours ? 'text-green-400' : 'text-yellow-400'}`} />
                        <span className="text-sm font-medium">
                          {isWithinHours ? '🟢 Sistema Ativo' : '🟡 Fora do Horário'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Próximo ciclo:</span>
                        <CountdownTimer targetDate={nextCronSlot} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Em Aquecimento */}
                {emAquecimentoInstances.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">🔥 Em Aquecimento ({emAquecimentoInstances.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Fase</TableHead>
                            <TableHead>Dias</TableHead>
                            <TableHead>Hoje</TableHead>
                            <TableHead>Próxima Msg</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {emAquecimentoInstances.map(inst => {
                            const limitReached = inst.interacoes_hoje >= inst.limite_diario;
                            const target = estimatedTargets[inst.instancia_id];
                            return (
                              <TableRow key={inst.id}>
                                <TableCell className="font-medium text-sm">📱 {inst.instance_name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{PHASE_LABELS[inst.fase] || `Fase ${inst.fase}`}</Badge>
                                </TableCell>
                                <TableCell className="text-sm">{inst.dias_conectado}d</TableCell>
                                <TableCell className="text-sm">{inst.interacoes_hoje}/{inst.limite_diario}</TableCell>
                                <TableCell>
                                  {limitReached ? (
                                    <span className="text-xs text-green-400">✅ Limite atingido</span>
                                  ) : !isWithinHours ? (
                                    <span className="text-xs text-yellow-400">⏸ Fora do horário</span>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      <CountdownTimer targetDate={nextCronSlot} />
                                      {target && (
                                        <span className="text-[11px] text-muted-foreground">→ para <strong>{target}</strong></span>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{inst.interacoes_total}</TableCell>
                                <TableCell>
                                  <Button size="sm" variant="ghost" onClick={() => pausarAquecimento(inst.id)}>
                                    <Pause className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Pausados */}
                {pausadoInstances.length > 0 && (
                  <Card className="border-yellow-500/30">
                    <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-yellow-500">⏸️ Pausados ({pausadoInstances.length})</CardTitle>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <PlayCircle className="h-3 w-3" /> Reativar Todos
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reativar todos os números?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso vai reativar {pausadoInstances.length} número(s) pausado(s) e retomar o aquecimento automático.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={forcarReinicio}>Reativar Todos</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Fase</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pausadoInstances.map(inst => (
                            <TableRow key={inst.id}>
                              <TableCell className="font-medium text-sm">{inst.instance_name}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">Fase {inst.fase}</Badge></TableCell>
                              <TableCell className="text-sm">{inst.interacoes_total}</TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => retomarAquecimento(inst.id)}>
                                  <Play className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {instancias.length === 0 && !loading && (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Flame className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p className="text-lg font-medium">Nenhum número em aquecimento</p>
                      <p className="text-sm mt-1">Conecte um número WhatsApp e ele será detectado automaticamente!</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Notifications */}
              <div>
                <AquecimentoNotificacoes />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'log' && (
          <Card>
            <CardHeader>
              <CardTitle>Log de Interações</CardTitle>
              <div className="flex gap-3 mt-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <select
                    value={logFilterStatus}
                    onChange={(e) => setLogFilterStatus(e.target.value)}
                    className="ml-2 rounded border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="todos">Todos</option>
                    <option value="ENVIADO">Enviado</option>
                    <option value="RESPONDIDO">Respondido</option>
                    <option value="ENTREGUE">Entregue</option>
                    <option value="FALHOU">Falhou</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input
                    type="date"
                    value={logFilterDate}
                    onChange={(e) => setLogFilterDate(e.target.value)}
                    className="ml-2 w-40 h-8 text-sm inline-block"
                  />
                </div>
                {(logFilterStatus !== 'todos' || logFilterDate) && (
                  <Button variant="ghost" size="sm" onClick={() => { setLogFilterStatus('todos'); setLogFilterDate(''); }}>Limpar</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resposta</TableHead>
                    <TableHead>Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interacoes
                    .filter(i => logFilterStatus === 'todos' || i.status === logFilterStatus)
                    .filter(i => !logFilterDate || (i.enviado_em && i.enviado_em.startsWith(logFilterDate)))
                    .map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm whitespace-nowrap">{i.enviado_em ? format(new Date(i.enviado_em), 'dd/MM HH:mm') : '-'}</TableCell>
                      <TableCell className="text-sm">{i.origem_nome}</TableCell>
                      <TableCell className="text-sm">{i.destino_nome}</TableCell>
                      <TableCell><Badge variant="outline">{i.tipo}</Badge></TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{i.conteudo}</TableCell>
                      <TableCell>
                        <Badge variant={i.status === 'RESPONDIDO' ? 'default' : i.status === 'FALHOU' ? 'destructive' : 'secondary'}>{i.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{i.conteudo_resposta || '-'}</TableCell>
                      <TableCell>{i.tempo_resposta_segundos ? `${i.tempo_resposta_segundos}s` : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {interacoes.filter(i => logFilterStatus === 'todos' || i.status === logFilterStatus).filter(i => !logFilterDate || (i.enviado_em && i.enviado_em.startsWith(logFilterDate))).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma interação registrada</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog Teste IA Manual */}
      <Dialog open={manualTestOpen} onOpenChange={setManualTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" /> Teste IA Manual
            </DialogTitle>
            <DialogDescription>
              Selecione 2+ instâncias para enviar mensagens de teste entre elas. A IA responderá automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {instancias.length} instâncias no aquecimento · {selectedTestIds.length} selecionadas
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                if (selectedTestIds.length === instancias.length) {
                  setSelectedTestIds([]);
                } else {
                  setSelectedTestIds(instancias.map(i => i.instancia_id));
                }
              }}
            >
              {selectedTestIds.length === instancias.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </Button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {instancias.map(inst => (
              <label key={inst.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={selectedTestIds.includes(inst.instancia_id)}
                  onCheckedChange={() => toggleTestId(inst.instancia_id)}
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">📱 {inst.instance_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Fase {inst.fase} · {inst.status}</span>
                </div>
              </label>
            ))}
            {instancias.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância em aquecimento</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualTestOpen(false)}>Cancelar</Button>
            <Button onClick={iniciarTesteManual} disabled={testLoading || selectedTestIds.length < 2}>
              {testLoading ? 'Enviando...' : `Iniciar Teste (${selectedTestIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
