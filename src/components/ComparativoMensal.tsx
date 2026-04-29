import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatarMoeda } from '@/lib/comissao';
import { TrendingUp, TrendingDown, Minus, BarChart3, ArrowRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ComparativoData {
  acordosCriados: number;
  acordosCriadosAnterior: number;
  valorAcordos: number;
  valorAcordosAnterior: number;
  pagamentosRecebidos: number;
  pagamentosRecebidosAnterior: number;
  valorRecebido: number;
  valorRecebidoAnterior: number;
}

interface Props {
  data: ComparativoData;
  diaAtual: number;
}

function calcVariacao(atual: number, anterior: number) {
  if (anterior === 0 && atual === 0) return { pct: 0, tipo: 'igual' as const };
  if (anterior === 0) return { pct: 100, tipo: 'subiu' as const };
  const pct = ((atual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, tipo: 'igual' as const };
  return { pct: Math.round(pct * 10) / 10, tipo: pct > 0 ? 'subiu' as const : 'caiu' as const };
}

function VariacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  const { pct, tipo } = calcVariacao(atual, anterior);
  if (tipo === 'subiu') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 gap-1 text-xs">
        <TrendingUp className="h-3 w-3" />
        +{pct}%
      </Badge>
    );
  }
  if (tipo === 'caiu') {
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/20 gap-1 text-xs">
        <TrendingDown className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 gap-1 text-xs">
      <Minus className="h-3 w-3" />
      Igual
    </Badge>
  );
}

function LinhaComparativa({
  label,
  anterior,
  atual,
  isCurrency = false,
}: {
  label: string;
  anterior: number;
  atual: number;
  isCurrency?: boolean;
}) {
  const fmt = isCurrency ? formatarMoeda : (v: number) => String(v);
  const max = Math.max(anterior, atual, 1);
  const pctAnterior = (anterior / max) * 100;
  const pctAtual = (atual / max) * 100;
  const { tipo } = calcVariacao(atual, anterior);

  const barColorAtual = tipo === 'subiu' ? 'bg-emerald-500' : tipo === 'caiu' ? 'bg-red-500' : 'bg-amber-500';

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <VariacaoBadge atual={atual} anterior={anterior} />
      </div>

      {/* Mês Anterior */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Mês anterior</span>
          <span className="font-medium text-muted-foreground">{fmt(anterior)}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-muted-foreground/30 transition-all duration-500"
            style={{ width: `${pctAnterior}%` }}
          />
        </div>
      </div>

      {/* Mês Atual */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground font-medium">Mês atual</span>
          <span className="font-bold text-foreground">{fmt(atual)}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${barColorAtual} transition-all duration-500`}
            style={{ width: `${pctAtual}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ComparativoMensal({ data, diaAtual }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <div>
          <CardTitle className="text-base">Comparativo com Mês Anterior</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Período: dia 1 até dia {diaAtual} de cada mês</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <LinhaComparativa
            label="Acordos Criados"
            anterior={data.acordosCriadosAnterior}
            atual={data.acordosCriados}
          />
          <LinhaComparativa
            label="Valor dos Acordos"
            anterior={data.valorAcordosAnterior}
            atual={data.valorAcordos}
            isCurrency
          />
          <LinhaComparativa
            label="Pagamentos Recebidos"
            anterior={data.pagamentosRecebidosAnterior}
            atual={data.pagamentosRecebidos}
          />
          <LinhaComparativa
            label="Valor Recebido"
            anterior={data.valorRecebidoAnterior}
            atual={data.valorRecebido}
            isCurrency
          />
        </div>
      </CardContent>
    </Card>
  );
}
