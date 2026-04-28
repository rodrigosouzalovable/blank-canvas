import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getCredorConfig } from "@/lib/credorConfig";
import logoSouzaRibeiro from "@/assets/logo-souza-ribeiro.png";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Target,
  BarChart3,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface DashboardData {
  totalRecuperado: number;
  totalMesAtual: number;
  totalMesAnterior: number;
  qtdAcordosMes: number;
  qtdAcordosMesAnterior: number;
  valorAcordosMes: number;
  ticketMedio: number;
  ticketMedioAnterior: number;
  taxaConversao: number;
  seriesMensal: { mes: string; valor: number }[];
  totalDevedores: number;
  totalAcordos: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function calcVariation(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function VariationBadge({ current, previous }: { current: number; previous: number }) {
  const variation = calcVariation(current, previous);
  const isPositive = variation >= 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium ${
        isPositive ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="h-4 w-4" />
      ) : (
        <ArrowDownRight className="h-4 w-4" />
      )}
      {Math.abs(variation).toFixed(1)}%
    </span>
  );
}

export default function CredorDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const credorConfig = slug ? getCredorConfig(slug) : undefined;

  useEffect(() => {
    if (!slug || !token) {
      setError("Acesso inválido. Verifique o link recebido.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/credor-dashboard-data?slug=${slug}&token=${encodeURIComponent(token)}`
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erro ao carregar dados");
        }

        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || "Erro ao carregar dados do dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug, token]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(220,20%,12%)] to-[hsl(220,25%,8%)] flex items-center justify-center p-4">
        <div className="bg-[hsl(220,20%,16%)] border border-[hsl(220,15%,25%)] rounded-2xl p-8 max-w-md text-center">
          <ShieldCheck className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[hsl(0,0%,95%)] mb-2">Acesso Negado</h2>
          <p className="text-[hsl(220,10%,60%)]">{error}</p>
        </div>
      </div>
    );
  }

  const currentMonthName = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(220,20%,12%)] to-[hsl(220,25%,8%)]">
      {/* Header */}
      <header className="border-b border-[hsl(220,15%,20%)] bg-[hsl(220,20%,10%)]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {credorConfig && (
              <img
                src={credorConfig.logos.principal}
                alt={credorConfig.nome}
                className="h-10 object-contain brightness-0 invert"
              />
            )}
            <div>
              <h1 className="text-lg font-semibold text-[hsl(0,0%,95%)]">
                Dashboard Executivo
              </h1>
              <p className="text-sm text-[hsl(220,10%,55%)]">
                Recuperação de Crédito — {credorConfig?.nome || slug}
              </p>
            </div>
          </div>
          <img
            src={logoSouzaRibeiro}
            alt="Souza e Ribeiro"
            className="h-8 object-contain brightness-0 invert opacity-60"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Period label */}
        <p className="text-[hsl(220,10%,55%)] text-sm mb-6 capitalize">
          Referência: {currentMonthName}
        </p>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Recuperado */}
          <Card className="bg-[hsl(220,20%,15%)] border-[hsl(220,15%,22%)] text-[hsl(0,0%,95%)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(220,10%,55%)]">
                Valor Total Recuperado
              </CardTitle>
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-40 bg-[hsl(220,15%,22%)]" />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {formatCurrency(data?.totalRecuperado || 0)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[hsl(220,10%,55%)]">Mês atual:</span>
                    <span className="text-sm font-medium text-emerald-400">
                      {formatCurrency(data?.totalMesAtual || 0)}
                    </span>
                    {data && (
                      <VariationBadge
                        current={data.totalMesAtual}
                        previous={data.totalMesAnterior}
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Acordos no Mês */}
          <Card className="bg-[hsl(220,20%,15%)] border-[hsl(220,15%,22%)] text-[hsl(0,0%,95%)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(220,10%,55%)]">
                Acordos no Mês
              </CardTitle>
              <FileText className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20 bg-[hsl(220,15%,22%)]" />
              ) : (
                <>
                  <p className="text-2xl font-bold">{data?.qtdAcordosMes || 0}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[hsl(220,10%,55%)]">
                      Total: {formatCurrency(data?.valorAcordosMes || 0)}
                    </span>
                    {data && (
                      <VariationBadge
                        current={data.qtdAcordosMes}
                        previous={data.qtdAcordosMesAnterior}
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Ticket Médio */}
          <Card className="bg-[hsl(220,20%,15%)] border-[hsl(220,15%,22%)] text-[hsl(0,0%,95%)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(220,10%,55%)]">
                Ticket Médio
              </CardTitle>
              <Target className="h-5 w-5 text-amber-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-32 bg-[hsl(220,15%,22%)]" />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {formatCurrency(data?.ticketMedio || 0)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[hsl(220,10%,55%)]">vs mês anterior</span>
                    {data && (
                      <VariationBadge
                        current={data.ticketMedio}
                        previous={data.ticketMedioAnterior}
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Taxa de Conversão */}
          <Card className="bg-[hsl(220,20%,15%)] border-[hsl(220,15%,22%)] text-[hsl(0,0%,95%)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(220,10%,55%)]">
                Taxa de Conversão
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-violet-400" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20 bg-[hsl(220,15%,22%)]" />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {(data?.taxaConversao || 0).toFixed(1)}%
                  </p>
                  <p className="text-xs text-[hsl(220,10%,55%)] mt-1">
                    {data?.totalAcordos || 0} acordos / {data?.totalDevedores || 0} devedores
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="bg-[hsl(220,20%,15%)] border-[hsl(220,15%,22%)] text-[hsl(0,0%,95%)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base">
                Comparativo Mensal — Valor Recuperado
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 flex items-center justify-center">
                <Skeleton className="h-full w-full bg-[hsl(220,15%,22%)]" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.seriesMensal || []}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(220, 15%, 22%)"
                  />
                  <XAxis
                    dataKey="mes"
                    tick={{ fill: "hsl(220, 10%, 55%)", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(220, 15%, 22%)" }}
                  />
                  <YAxis
                    tick={{ fill: "hsl(220, 10%, 55%)", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(220, 15%, 22%)" }}
                    tickFormatter={(v) =>
                      `R$ ${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 20%, 15%)",
                      border: "1px solid hsl(220, 15%, 25%)",
                      borderRadius: "8px",
                      color: "hsl(0, 0%, 95%)",
                    }}
                    formatter={(value: number) => [
                      formatCurrency(value),
                      "Valor Recuperado",
                    ]}
                  />
                  <Bar
                    dataKey="valor"
                    fill="hsl(160, 84%, 39%)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {!loading && data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <div className="bg-[hsl(220,20%,15%)] border border-[hsl(220,15%,22%)] rounded-xl p-5 text-center">
              <p className="text-[hsl(220,10%,55%)] text-sm">Total de Acordos</p>
              <p className="text-3xl font-bold text-[hsl(0,0%,95%)] mt-1">
                {data.totalAcordos}
              </p>
            </div>
            <div className="bg-[hsl(220,20%,15%)] border border-[hsl(220,15%,22%)] rounded-xl p-5 text-center">
              <p className="text-[hsl(220,10%,55%)] text-sm">Devedores Ativos</p>
              <p className="text-3xl font-bold text-[hsl(0,0%,95%)] mt-1">
                {data.totalDevedores}
              </p>
            </div>
            <div className="bg-[hsl(220,20%,15%)] border border-[hsl(220,15%,22%)] rounded-xl p-5 text-center">
              <p className="text-[hsl(220,10%,55%)] text-sm">Recuperação All-Time</p>
              <p className="text-3xl font-bold text-emerald-400 mt-1">
                {formatCurrency(data.totalRecuperado)}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[hsl(220,15%,20%)] mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[hsl(220,10%,45%)] text-xs">
            Dashboard Executivo — Souza e Ribeiro Advogados
          </p>
          <p className="text-[hsl(220,10%,35%)] text-xs mt-1">
            Dados atualizados em tempo real • Acesso restrito por token
          </p>
        </div>
      </footer>
    </div>
  );
}
