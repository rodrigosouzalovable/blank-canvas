import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameDay, startOfWeek, endOfWeek, isToday, isBefore, isAfter, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Target, TrendingUp, Calendar, Trophy, Flame, Star, ChevronLeft, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function getBusinessDaysRemaining(date: Date): number {
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start: date, end });
  return days.filter(d => !isWeekend(d)).length;
}

function getBusinessDaysInMonth(date: Date): number {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  return days.filter(d => !isWeekend(d)).length;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function MetaPessoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaInput, setMetaInput] = useState('');
  const [celebratedMilestones, setCelebratedMilestones] = useState<number[]>([]);

  const mesAno = format(currentMonth, 'yyyy-MM');
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch user's meta for this month
  const { data: meta } = useQuery({
    queryKey: ['meta-funcionario', user?.id, mesAno],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metas_funcionarios' as any)
        .select('*')
        .eq('user_id', user!.id)
        .eq('mes_ano', mesAno)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user?.id,
  });

  // Fetch paid payments for this month (user's acordos)
  const { data: pagamentos } = useQuery({
    queryKey: ['pagamentos-meta', user?.id, mesAno],
    queryFn: async () => {
      const { data: acordos } = await supabase
        .from('acordos')
        .select('id')
        .eq('user_id', user!.id);
      
      if (!acordos || acordos.length === 0) return [];

      const acordoIds = acordos.map(a => a.id);
      const { data, error } = await supabase
        .from('pagamentos')
        .select('valor_parcela, data_paga')
        .in('acordo_id', acordoIds)
        .eq('status', 'pago')
        .gte('data_paga', format(monthStart, 'yyyy-MM-dd'))
        .lte('data_paga', format(monthEnd, 'yyyy-MM-dd'));

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // refresh every 30s
  });

  // Save/update meta
  const saveMeta = useMutation({
    mutationFn: async (valor: number) => {
      if (meta) {
        const { error } = await supabase
          .from('metas_funcionarios' as any)
          .update({ valor_meta: valor, atualizado_em: new Date().toISOString() } as any)
          .eq('id', (meta as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('metas_funcionarios' as any)
          .insert({ user_id: user!.id, mes_ano: mesAno, valor_meta: valor } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-funcionario'] });
      setEditingMeta(false);
      toast.success('Meta atualizada!');
    },
    onError: () => toast.error('Erro ao salvar meta'),
  });

  // Computed values
  const valorMeta = meta ? Number((meta as any).valor_meta) : 0;

  const { totalMes, totalHoje, totalSemana, dailyTotals, bestDay, streak } = useMemo(() => {
    if (!pagamentos || pagamentos.length === 0) {
      return { totalMes: 0, totalHoje: 0, totalSemana: 0, dailyTotals: new Map<string, number>(), bestDay: { date: '', value: 0 }, streak: 0 };
    }

    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const todayStr = format(today, 'yyyy-MM-dd');

    let totalMes = 0;
    let totalHoje = 0;
    let totalSemana = 0;
    const dailyTotals = new Map<string, number>();

    for (const p of pagamentos) {
      const val = Number(p.valor_parcela);
      const dataPaga = p.data_paga!;
      totalMes += val;

      if (dataPaga === todayStr) totalHoje += val;

      const pDate = new Date(dataPaga + 'T12:00:00');
      if (pDate >= weekStart && pDate <= weekEnd) totalSemana += val;

      dailyTotals.set(dataPaga, (dailyTotals.get(dataPaga) || 0) + val);
    }

    // Best day
    let bestDay = { date: '', value: 0 };
    dailyTotals.forEach((val, date) => {
      if (val > bestDay.value) bestDay = { date, value: val };
    });

    // Streak: consecutive business days with payments
    let streak = 0;
    const allDays = eachDayOfInterval({ start: monthStart, end: today > monthEnd ? monthEnd : today });
    const businessDays = allDays.filter(d => !isWeekend(d)).reverse();
    for (const d of businessDays) {
      const key = format(d, 'yyyy-MM-dd');
      if (dailyTotals.has(key) && dailyTotals.get(key)! > 0) {
        streak++;
      } else if (isBefore(d, today) || isSameDay(d, today)) {
        break;
      }
    }

    return { totalMes, totalHoje, totalSemana, dailyTotals, bestDay, streak };
  }, [pagamentos, monthStart, monthEnd]);

  const percentual = valorMeta > 0 ? Math.min((totalMes / valorMeta) * 100, 100) : 0;
  const restante = Math.max(valorMeta - totalMes, 0);
  const today = new Date();
  const businessDaysLeft = getBusinessDaysRemaining(today > monthEnd ? monthEnd : today);
  const necessarioPorDia = businessDaysLeft > 0 ? restante / businessDaysLeft : 0;
  const necessarioPorSemana = necessarioPorDia * 5;

  // Milestone celebrations
  useEffect(() => {
    if (valorMeta <= 0) return;
    const milestones = [25, 50, 75, 100];
    for (const m of milestones) {
      if (percentual >= m && !celebratedMilestones.includes(m)) {
        setCelebratedMilestones(prev => [...prev, m]);
        const msgs: Record<number, string> = {
          25: '🎯 25% da meta alcançada! Continue assim!',
          50: '🔥 Metade da meta conquistada! Você está voando!',
          75: '🚀 75%! Falta pouco para a glória!',
          100: '🏆 META BATIDA! Você é uma máquina! 🎉',
        };
        toast.success(msgs[m], { duration: 5000 });
      }
    }
  }, [percentual, valorMeta, celebratedMilestones]);

  // Calendar heatmap
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1;
    return { days, startPadding };
  }, [monthStart, monthEnd]);

  const getHeatColor = (value: number) => {
    if (value === 0) return 'bg-muted';
    const dailyTarget = valorMeta > 0 ? valorMeta / getBusinessDaysInMonth(currentMonth) : 1;
    const ratio = value / dailyTarget;
    if (ratio >= 1.5) return 'bg-emerald-500 dark:bg-emerald-600';
    if (ratio >= 1) return 'bg-emerald-400 dark:bg-emerald-500';
    if (ratio >= 0.5) return 'bg-yellow-400 dark:bg-yellow-500';
    return 'bg-orange-400 dark:bg-orange-500';
  };

  const handleSaveMeta = () => {
    const parsed = parseFloat(metaInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Digite um valor válido');
      return;
    }
    saveMeta.mutate(parsed);
  };

  const navigateMonth = (dir: number) => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + dir);
    setCurrentMonth(d);
    setCelebratedMilestones([]);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Target className="h-8 w-8 text-primary" />
              Minha Meta
            </h1>
            <p className="text-muted-foreground mt-1">Acompanhe seu progresso mensal</p>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[160px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Meta input section */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label className="text-base font-semibold whitespace-nowrap">Meta do mês:</Label>
              {editingMeta ? (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-muted-foreground">R$</span>
                  <Input
                    value={metaInput}
                    onChange={e => setMetaInput(e.target.value)}
                    placeholder="10.000,00"
                    className="max-w-[200px]"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveMeta()}
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveMeta}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingMeta(false)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {valorMeta > 0 ? formatCurrency(valorMeta) : 'Não definida'}
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => { setMetaInput(valorMeta > 0 ? valorMeta.toString().replace('.', ',') : ''); setEditingMeta(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {valorMeta > 0 && (
          <>
            {/* Main progress */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Progresso Mensal</span>
                  <Badge variant={percentual >= 100 ? 'default' : 'secondary'} className="text-lg px-3 py-1">
                    {percentual.toFixed(1)}%
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {formatCurrency(totalMes)} de {formatCurrency(valorMeta)}
                  {restante > 0 && ` — faltam ${formatCurrency(restante)}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={percentual} className="h-6" />
                {/* Milestone markers */}
                <div className="relative mt-1 h-4">
                  {[25, 50, 75, 100].map(m => (
                    <div key={m} className="absolute flex flex-col items-center" style={{ left: `${m}%`, transform: 'translateX(-50%)' }}>
                      <span className={cn('text-[10px]', percentual >= m ? 'text-primary font-bold' : 'text-muted-foreground')}>
                        {m}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Recebido Hoje</p>
                      <p className="text-xl font-bold">{formatCurrency(totalHoje)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Recebido na Semana</p>
                      <p className="text-xl font-bold">{formatCurrency(totalSemana)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <Target className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Necessário/Dia</p>
                      <p className="text-xl font-bold">{formatCurrency(necessarioPorDia)}</p>
                      <p className="text-xs text-muted-foreground">{businessDaysLeft} dias úteis restantes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <Target className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Necessário/Semana</p>
                      <p className="text-xl font-bold">{formatCurrency(necessarioPorSemana)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Motivational stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Trophy className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Melhor Dia</p>
                  <p className="text-lg font-bold">{bestDay.value > 0 ? formatCurrency(bestDay.value) : '-'}</p>
                  {bestDay.date && <p className="text-xs text-muted-foreground">{format(new Date(bestDay.date + 'T12:00:00'), 'dd/MM')}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <Flame className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Sequência Ativa</p>
                  <p className="text-lg font-bold">{streak} {streak === 1 ? 'dia' : 'dias'}</p>
                  <p className="text-xs text-muted-foreground">dias úteis consecutivos</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <Star className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Total do Mês</p>
                  <p className="text-lg font-bold">{formatCurrency(totalMes)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Calendar Heatmap */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Calendário de Performance
                </CardTitle>
                <CardDescription>Cada dia mostra o valor recebido — quanto mais verde, melhor!</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="font-medium">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
                    <div key={`pad-${i}`} className="aspect-square" />
                  ))}
                  {calendarDays.days.map(day => {
                    const key = format(day, 'yyyy-MM-dd');
                    const value = dailyTotals.get(key) || 0;
                    const isFuture = isAfter(day, today);
                    const weekend = isWeekend(day);

                    return (
                      <div
                        key={key}
                        className={cn(
                          'aspect-square rounded-md flex flex-col items-center justify-center text-xs relative group cursor-default transition-transform hover:scale-110',
                          isFuture ? 'bg-muted/50 text-muted-foreground' :
                          weekend ? 'bg-muted/30 text-muted-foreground' :
                          getHeatColor(value),
                          isToday(day) && 'ring-2 ring-primary'
                        )}
                      >
                        <span className={cn('font-medium', value > 0 && !isFuture && !weekend && 'text-card')}>{format(day, 'd')}</span>
                        {/* Tooltip */}
                        {value > 0 && (
                          <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow-lg whitespace-nowrap">
                            {formatCurrency(value)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground justify-end">
                  <span>Menos</span>
                  <div className="w-4 h-4 rounded bg-muted" />
                  <div className="w-4 h-4 rounded bg-orange-400 dark:bg-orange-500" />
                  <div className="w-4 h-4 rounded bg-yellow-400 dark:bg-yellow-500" />
                  <div className="w-4 h-4 rounded bg-emerald-400 dark:bg-emerald-500" />
                  <div className="w-4 h-4 rounded bg-emerald-500 dark:bg-emerald-600" />
                  <span>Mais</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {valorMeta <= 0 && (
          <Card>
            <CardContent className="pt-6 text-center py-16">
              <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Defina sua meta mensal</h2>
              <p className="text-muted-foreground mb-4">
                Clique no ícone de edição acima para definir quanto deseja receber este mês
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
