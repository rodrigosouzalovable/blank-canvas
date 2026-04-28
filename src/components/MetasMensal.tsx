import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Target, TrendingUp, Calendar, DollarSign, Users, Trophy, ArrowUp, ArrowDown, Minus, Pencil } from 'lucide-react';
import { differenceInDays, endOfMonth, format, startOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

interface MetasMensalProps {
  mesAno: string; // formato "2026-01"
}

interface FuncionarioData {
  userId: string;
  nome: string;
  totalRecebido: number;
  metaIndividual: number;
  faltante: number;
  porDia: number;
  percentualEquipe: number;
}

interface EvolucaoDiaria {
  dia: string;
  acumulado: number;
  metaIdeal: number;
}

// Função para calcular dias úteis (segunda a sexta)
function calcularDiasUteisRestantes(dataInicio: Date, dataFim: Date): number {
  let diasUteis = 0;
  const dataAtual = new Date(dataInicio);
  
  while (dataAtual <= dataFim) {
    const diaSemana = dataAtual.getDay();
    // 0 = Domingo, 6 = Sábado - ignorar finais de semana
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteis++;
    }
    dataAtual.setDate(dataAtual.getDate() + 1);
  }
  
  return diasUteis;
}

function calcularDiasUteisTotais(dataInicio: Date, dataFim: Date): number {
  return calcularDiasUteisRestantes(dataInicio, dataFim);
}

export function MetasMensal({ mesAno }: MetasMensalProps) {
  const { isAdmin } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [metaValor, setMetaValor] = useState(0);
  const [totalRecebido, setTotalRecebido] = useState(0);
  const [funcionarios, setFuncionarios] = useState<FuncionarioData[]>([]);
  const [evolucaoDiaria, setEvolucaoDiaria] = useState<EvolucaoDiaria[]>([]);
  const [totalFuncionarios, setTotalFuncionarios] = useState(0);
  
  // Estado para edição da meta
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newMetaValue, setNewMetaValue] = useState('');
  const [newMesAno, setNewMesAno] = useState(mesAno);
  const [saving, setSaving] = useState(false);

  // Memoizar datas para evitar recriação a cada render
  const { dataInicio, dataFim, hoje } = useMemo(() => {
    const inicio = startOfMonth(parseISO(`${mesAno}-01`));
    const fim = endOfMonth(inicio);
    const hojeDate = new Date();
    return { dataInicio: inicio, dataFim: fim, hoje: hojeDate };
  }, [mesAno]);
  
  // Memoizar cálculos de dias
  const { diasUteisRestantes, diasUteisPassados, totalDiasUteisMes, diasPassados, totalDiasMes } = useMemo(() => {
    const uteisRestantes = Math.max(1, calcularDiasUteisRestantes(hoje, dataFim));
    const uteisPassados = calcularDiasUteisRestantes(dataInicio, hoje);
    const totalUteis = calcularDiasUteisTotais(dataInicio, dataFim);
    const passados = differenceInDays(hoje, dataInicio) + 1;
    const total = differenceInDays(dataFim, dataInicio) + 1;
    return {
      diasUteisRestantes: uteisRestantes,
      diasUteisPassados: uteisPassados,
      totalDiasUteisMes: totalUteis,
      diasPassados: passados,
      totalDiasMes: total,
    };
  }, [dataInicio, dataFim, hoje]);

  const valorFaltante = Math.max(0, metaValor - totalRecebido);
  const valorPorDia = diasUteisRestantes > 0 ? valorFaltante / diasUteisRestantes : 0;
  const percentualAtingido = metaValor > 0 ? (totalRecebido / metaValor) * 100 : 0;
  const percentualTempo = totalDiasUteisMes > 0 ? (diasUteisPassados / totalDiasUteisMes) * 100 : 0;

  // Projeção baseada no ritmo atual
  const mediaDiaria = diasUteisPassados > 0 ? totalRecebido / diasUteisPassados : 0;
  const projecaoFechamento = mediaDiaria * totalDiasUteisMes;

  // Ritmo: comparação entre percentual atingido e percentual do tempo
  const ritmo = percentualTempo > 0 ? percentualAtingido / percentualTempo : 0;

  // Buscar meta do banco de dados
  useEffect(() => {
    async function fetchMeta() {
      const { data, error } = await supabase
        .from('metas_mensais')
        .select('valor')
        .eq('mes_ano', mesAno)
        .maybeSingle();

      if (!error && data) {
        setMetaValor(Number(data.valor));
      } else {
        setMetaValor(0);
      }
    }

    fetchMeta();
  }, [mesAno]);

  useEffect(() => {
    async function fetchData() {
      if (metaValor === 0) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      const dataInicioStr = format(dataInicio, 'yyyy-MM-dd');
      const dataFimStr = format(dataFim, 'yyyy-MM-dd');

      // Buscar total de funcionários ativos
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nome');

      if (profilesError) {
        console.error('Erro ao buscar profiles:', profilesError);
        setLoading(false);
        return;
      }

      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => {
        profileMap[p.id] = p.nome;
      });

      setTotalFuncionarios(profiles?.length || 0);

      // Buscar pagamentos do mês
      const { data: pagamentos, error: pagamentosError } = await supabase
        .from('pagamentos')
        .select('valor_parcela, acordo_id, data_paga')
        .eq('status', 'pago')
        .gte('data_paga', dataInicioStr)
        .lte('data_paga', dataFimStr);

      if (pagamentosError) {
        console.error('Erro ao buscar pagamentos:', pagamentosError);
        setLoading(false);
        return;
      }

      // Buscar acordos para mapear user_id
      const acordoIds = [...new Set(pagamentos?.map(p => p.acordo_id) || [])];
      
      let acordoUserMap: Record<string, string> = {};
      if (acordoIds.length > 0) {
        const { data: acordos } = await supabase
          .from('acordos')
          .select('id, user_id')
          .in('id', acordoIds);
        
        acordos?.forEach(a => {
          acordoUserMap[a.id] = a.user_id;
        });
      }

      // Calcular totais
      let total = 0;
      const valoresPorFuncionario: Record<string, number> = {};
      const valoresPorDia: Record<string, number> = {};

      pagamentos?.forEach(p => {
        const valor = Number(p.valor_parcela) || 0;
        total += valor;

        const userId = acordoUserMap[p.acordo_id];
        if (userId) {
          valoresPorFuncionario[userId] = (valoresPorFuncionario[userId] || 0) + valor;
        }

        if (p.data_paga) {
          valoresPorDia[p.data_paga] = (valoresPorDia[p.data_paga] || 0) + valor;
        }
      });

      setTotalRecebido(total);

      // Calcular dados por funcionário
      const metaIndividual = metaValor / (profiles?.length || 1);
      const funcionariosData: FuncionarioData[] = profiles?.map(p => {
        const recebido = valoresPorFuncionario[p.id] || 0;
        const faltante = Math.max(0, metaIndividual - recebido);
        return {
          userId: p.id,
          nome: p.nome,
          totalRecebido: recebido,
          metaIndividual,
          faltante,
          porDia: diasUteisRestantes > 0 ? faltante / diasUteisRestantes : 0,
          percentualEquipe: total > 0 ? (recebido / total) * 100 : 0,
        };
      }).sort((a, b) => b.totalRecebido - a.totalRecebido) || [];

      setFuncionarios(funcionariosData);

      // Calcular evolução diária (mantém dias corridos para visualização)
      const evolucao: EvolucaoDiaria[] = [];
      let acumulado = 0;
      const metaDiaria = metaValor / totalDiasUteisMes;

      for (let i = 0; i < diasPassados; i++) {
        const data = new Date(dataInicio);
        data.setDate(data.getDate() + i);
        const dataStr = format(data, 'yyyy-MM-dd');
        
        acumulado += valoresPorDia[dataStr] || 0;
        
        // Calcular quantos dias úteis passaram até esta data
        const diasUteisAteData = calcularDiasUteisRestantes(dataInicio, data);
        
        evolucao.push({
          dia: format(data, 'dd/MM'),
          acumulado,
          metaIdeal: metaDiaria * diasUteisAteData,
        });
      }

      setEvolucaoDiaria(evolucao);
      setLoading(false);
    }

    fetchData();
  }, [mesAno, metaValor, dataInicio, dataFim, diasPassados, diasUteisRestantes, totalDiasUteisMes]);

  // Formatação de moeda para input
  const formatCurrencyInput = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const number = parseInt(numericValue, 10) / 100;
    if (isNaN(number)) return '';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(number);
  };

  const handleMetaInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setNewMetaValue(formatted);
  };

  const handleOpenEditDialog = () => {
    setNewMetaValue(formatCurrency(metaValor));
    setNewMesAno(mesAno);
    setEditDialogOpen(true);
  };

  const handleSaveMeta = async () => {
    setSaving(true);
    
    // Extrair valor numérico
    const numericValue = parseFloat(
      newMetaValue.replace(/[R$\s.]/g, '').replace(',', '.')
    );
    
    if (isNaN(numericValue) || numericValue <= 0) {
      toast.error('Valor inválido. Digite um valor maior que zero.');
      setSaving(false);
      return;
    }

    const targetMesAno = newMesAno || mesAno;
    
    const { error } = await supabase
      .from('metas_mensais')
      .upsert({
        mes_ano: targetMesAno,
        valor: numericValue,
        atualizado_em: new Date().toISOString(),
      }, {
        onConflict: 'mes_ano'
      });

    if (error) {
      console.error('Erro ao salvar meta:', error);
      toast.error('Erro ao salvar meta. Tente novamente.');
    } else {
      toast.success('Meta atualizada com sucesso!');
      setMetaValor(numericValue);
      setEditDialogOpen(false);
    }
    
    setSaving(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getProgressColor = () => {
    if (ritmo >= 1) return 'bg-green-500';
    if (ritmo >= 0.8) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRitmoIcon = () => {
    if (ritmo >= 1) return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (ritmo >= 0.8) return <Minus className="h-4 w-4 text-yellow-500" />;
    return <ArrowDown className="h-4 w-4 text-red-500" />;
  };

  const getRitmoText = () => {
    if (ritmo >= 1) return 'Acima da meta';
    if (ritmo >= 0.8) return 'Próximo da meta';
    return 'Abaixo da meta';
  };

  const getMedalIcon = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}.`;
  };

  const mesNome = format(dataInicio, 'MMMM yyyy', { locale: ptBR });

  if (loading && metaValor > 0) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Se não tem meta definida, mostrar mensagem para definir
  if (metaValor === 0) {
    return (
      <>
        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Target className="h-6 w-6 text-primary" />
              Meta do Mês - {mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 ml-1"
                  onClick={handleOpenEditDialog}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Target className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Nenhuma meta definida para este mês.
              </p>
              {isAdmin && (
                <Button onClick={handleOpenEditDialog}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Definir Meta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Definir Meta do Mês</DialogTitle>
              <DialogDescription>
                Defina o valor da meta para {mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="meta-mes-new">Mês</Label>
                <Input
                  id="meta-mes-new"
                  type="month"
                  value={newMesAno}
                  onChange={(e) => setNewMesAno(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-value-new">Valor da Meta</Label>
                <Input
                  id="meta-value-new"
                  placeholder="R$ 0,00"
                  value={newMetaValue}
                  onChange={handleMetaInputChange}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveMeta} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="space-y-6 mb-8">
      {/* Header da Meta */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Target className="h-6 w-6 text-primary" />
            Meta do Mês - {mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 ml-1"
                onClick={handleOpenEditDialog}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{formatCurrency(totalRecebido)} de {formatCurrency(metaValor)}</span>
              <span className="flex items-center gap-1">
                {getRitmoIcon()}
                {getRitmoText()}
              </span>
            </div>
            <div className="relative">
              <Progress value={Math.min(100, percentualAtingido)} className="h-4" />
              <div 
                className={`absolute top-0 left-0 h-4 rounded-full transition-all ${getProgressColor()}`}
                style={{ width: `${Math.min(100, percentualAtingido)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
                {percentualAtingido.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Projeção de fechamento: <span className={projecaoFechamento >= metaValor ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                  {formatCurrency(projecaoFechamento)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {diasPassados} de {totalDiasMes} dias
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Já Recebido</p>
                <p className="text-xl font-bold text-green-500">{formatCurrency(totalRecebido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Falta Receber</p>
                <p className="text-xl font-bold text-red-500">{formatCurrency(valorFaltante)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dias Úteis Restantes</p>
                <p className="text-xl font-bold text-blue-500">{diasUteisRestantes} dias</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Target className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Necessário/Dia Útil</p>
                <p className="text-xl font-bold text-purple-500">{formatCurrency(valorPorDia)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico e Ranking lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Evolução */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Evolução Diária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-hidden">
              <ChartContainer
                config={{
                  acumulado: { label: 'Recebido', color: 'hsl(var(--primary))' },
                  metaIdeal: { label: 'Meta Ideal', color: 'hsl(var(--muted-foreground))' },
                }}
                className="h-64 w-full"
              >
                <LineChart data={evolucaoDiaria}>
                    <XAxis 
                      dataKey="dia" 
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="metaIdeal" 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="acumulado" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                </LineChart>
              </ChartContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-primary" />
                <span className="text-muted-foreground">Recebido</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-muted-foreground border-dashed border-t-2" />
                <span className="text-muted-foreground">Meta Ideal</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Ranking do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {funcionarios.map((func, index) => (
                <div 
                  key={func.userId} 
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    index < 3 ? 'bg-primary/5' : 'bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-8">{getMedalIcon(index)}</span>
                    <div>
                      <p className="font-medium text-sm truncate max-w-[150px]">{func.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {func.percentualEquipe.toFixed(1)}% da equipe
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-green-500">
                      {formatCurrency(func.totalRecebido)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desempenho por Funcionário */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Desempenho Individual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funcionarios.map((func) => {
              const percentualMeta = (func.totalRecebido / func.metaIndividual) * 100;
              return (
                <div key={func.userId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{func.nome}</span>
                    <span className="text-sm text-muted-foreground">
                      Meta: {formatCurrency(func.metaIndividual)}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={Math.min(100, percentualMeta)} className="h-2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Recebido: </span>
                      <span className="font-medium text-green-500">{formatCurrency(func.totalRecebido)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Falta: </span>
                      <span className="font-medium text-red-500">{formatCurrency(func.faltante)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Por dia útil: </span>
                      <span className="font-medium text-purple-500">{formatCurrency(func.porDia)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Meta do Mês</DialogTitle>
            <DialogDescription>
              Defina o novo valor da meta para {mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="meta-mes">Mês</Label>
              <Input
                id="meta-mes"
                type="month"
                value={newMesAno}
                onChange={(e) => setNewMesAno(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-value">Valor da Meta</Label>
              <Input
                id="meta-value"
                placeholder="R$ 0,00"
                value={newMetaValue}
                onChange={handleMetaInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMeta} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
