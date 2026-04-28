import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

interface RankingItem {
  user_id: string;
  nome: string;
  total_recebido: number;
}

const formatarMoeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const medalhas = ['🥇', '🥈', '🥉'];

export function RankingMensal() {
  const { data: ranking, isLoading } = useQuery({
    queryKey: ['ranking-mensal'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ranking_mensal' as any);
      if (error) throw error;
      return (data as RankingItem[]) || [];
    },
  });

  const totalEquipe = ranking?.reduce((sum, r) => sum + Number(r.total_recebido), 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Ranking do Mês
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !ranking?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum dado disponível este mês.
          </p>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-2">
              {ranking.map((item, index) => {
                const percentual = totalEquipe > 0
                  ? ((Number(item.total_recebido) / totalEquipe) * 100).toFixed(1)
                  : '0.0';

                return (
                  <div
                    key={item.user_id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <span className="text-lg font-bold w-8 text-center shrink-0">
                      {index < 3 ? medalhas[index] : `${index + 1}º`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.nome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
                          {percentual}%
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 shrink-0">
                      {formatarMoeda(Number(item.total_recebido))}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t text-right">
              <span className="text-sm text-muted-foreground">Total da equipe: </span>
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                {formatarMoeda(totalEquipe)}
              </span>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
