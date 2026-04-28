import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatarMoeda, formatarData } from '@/lib/comissao';
import { PlusCircle, FileText, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, startOfMonth, endOfDay, min } from 'date-fns';
import { MetasMensal } from '@/components/MetasMensal';
import { ComparativoMensal } from '@/components/ComparativoMensal';

export default function Dashboard() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', user?.id, isAdmin],
    queryFn: async () => {
      if (!user) throw new Error('No user');

      const agora = new Date();
      const inicioMesAtual = startOfMonth(agora);
      const inicioMesAnterior = startOfMonth(subMonths(agora, 1));
      const mesmoDiaMesAnterior = subMonths(agora, 1);

      const inicioAtualISO = inicioMesAtual.toISOString();
      const agoraISO = agora.toISOString();
      const inicioAnteriorISO = inicioMesAnterior.toISOString();
      const mesmoDiaAnteriorISO = mesmoDiaMesAnterior.toISOString();

      // Personal data queries
      const [acordosRes, pagamentosRes] = await Promise.all([
        supabase.from('acordos').select('*').eq('user_id', user.id).order('criado_em', { ascending: false }),
        supabase.from('pagamentos').select('*, acordos!inner(user_id)').eq('acordos.user_id', user.id),
      ]);

      const acordos = acordosRes.data || [];
      const pagamentos = pagamentosRes.data || [];

      const acordosAtivos = acordos.filter(a => a.status === 'ativo').length;
      const pagamentosPagos = pagamentos.filter(p => p.status === 'pago');
      const pagamentosPendentes = pagamentos.filter(p => p.status === 'pendente');
      const comissaoRecebida = pagamentosPagos.reduce((sum, p) => sum + Number(p.comissao_parcela), 0);
      const comissaoPendente = pagamentosPendentes.reduce((sum, p) => sum + Number(p.comissao_parcela), 0);

      const comissoesPorMes: Record<string, number> = {};
      pagamentosPagos.forEach(p => {
        if (p.data_paga) {
          const mes = new Date(p.data_paga).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
          comissoesPorMes[mes] = (comissoesPorMes[mes] || 0) + Number(p.comissao_parcela);
        }
      });

      // Comparativo: admin usa RPC global, outros usam queries normais (filtradas por RLS)
      let comparativo;
      if (isAdmin) {
        const { data: globalData, error } = await supabase.rpc('comparativo_mensal_global', {
          p_inicio_atual: inicioAtualISO,
          p_fim_atual: agoraISO,
          p_inicio_anterior: inicioAnteriorISO,
          p_fim_anterior: mesmoDiaAnteriorISO,
        });
        if (error) throw error;
        const g = globalData as any;
        comparativo = {
          acordosCriados: Number(g.acordos_atual_qtd),
          acordosCriadosAnterior: Number(g.acordos_anterior_qtd),
          valorAcordos: Number(g.acordos_atual_valor),
          valorAcordosAnterior: Number(g.acordos_anterior_valor),
          pagamentosRecebidos: Number(g.pgtos_atual_qtd),
          pagamentosRecebidosAnterior: Number(g.pgtos_anterior_qtd),
          valorRecebido: Number(g.pgtos_atual_valor),
          valorRecebidoAnterior: Number(g.pgtos_anterior_valor),
        };
      } else {
        const [acordosAtualRes, acordosAnteriorRes, pgRecAtualRes, pgRecAnteriorRes] = await Promise.all([
          supabase.from('acordos').select('id, valor_total').gte('criado_em', inicioAtualISO).lte('criado_em', agoraISO),
          supabase.from('acordos').select('id, valor_total').gte('criado_em', inicioAnteriorISO).lte('criado_em', mesmoDiaAnteriorISO),
          supabase.from('pagamentos').select('id, valor_parcela').eq('status', 'pago').gte('data_paga', inicioAtualISO.slice(0, 10)).lte('data_paga', agoraISO.slice(0, 10)),
          supabase.from('pagamentos').select('id, valor_parcela').eq('status', 'pago').gte('data_paga', inicioAnteriorISO.slice(0, 10)).lte('data_paga', mesmoDiaAnteriorISO.slice(0, 10)),
        ]);
        const acAtual = acordosAtualRes.data || [];
        const acAnterior = acordosAnteriorRes.data || [];
        const pgAtual = pgRecAtualRes.data || [];
        const pgAnterior = pgRecAnteriorRes.data || [];
        comparativo = {
          acordosCriados: acAtual.length,
          acordosCriadosAnterior: acAnterior.length,
          valorAcordos: acAtual.reduce((s, a) => s + Number(a.valor_total), 0),
          valorAcordosAnterior: acAnterior.reduce((s, a) => s + Number(a.valor_total), 0),
          pagamentosRecebidos: pgAtual.length,
          pagamentosRecebidosAnterior: pgAnterior.length,
          valorRecebido: pgAtual.reduce((s, p) => s + Number(p.valor_parcela), 0),
          valorRecebidoAnterior: pgAnterior.reduce((s, p) => s + Number(p.valor_parcela), 0),
        };
      }

      return {
        totalAcordos: acordos.length,
        acordosAtivos,
        comissaoPendente,
        comissaoRecebida,
        ultimosAcordos: acordos.slice(0, 5),
        comissoesPorMes: Object.entries(comissoesPorMes).map(([mes, valor]) => ({ mes, valor })),
        comparativo,
        diaAtual: agora.getDate(),
      };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <Button asChild>
            <Link to="/acordos/novo">
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Acordo
            </Link>
          </Button>
        </div>

        {isAdmin && (
          <MetasMensal mesAno={format(new Date(), 'yyyy-MM')} />
        )}

        {data?.comparativo && (
          <ComparativoMensal data={data.comparativo} diaAtual={data.diaAtual} />
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Acordos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalAcordos || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Acordos Ativos</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.acordosAtivos || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Comissão Pendente</CardTitle>
              <DollarSign className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {formatarMoeda(data?.comissaoPendente || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Comissão Recebida</CardTitle>
              <CheckCircle className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-secondary">
                {formatarMoeda(data?.comissaoRecebida || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Comissões por Mês</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.comissoesPorMes && data.comissoesPorMes.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.comissoesPorMes}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => formatarMoeda(value)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="valor" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  Nenhuma comissão recebida ainda
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Últimos Acordos</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/acordos">Ver todos</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {data?.ultimosAcordos && data.ultimosAcordos.length > 0 ? (
                <div className="space-y-4">
                  {data.ultimosAcordos.map((acordo) => (
                    <Link
                      key={acordo.id}
                      to={`/acordos/${acordo.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div>
                        <p className="font-medium">{acordo.cliente_nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatarData(acordo.criado_em)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatarMoeda(acordo.valor_total)}</p>
                        <Badge variant={acordo.status === 'ativo' ? 'default' : 'secondary'}>
                          {acordo.status === 'ativo' ? 'Ativo' : acordo.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <p>Nenhum acordo cadastrado</p>
                  <Button className="mt-4" asChild>
                    <Link to="/acordos/novo">Criar primeiro acordo</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
