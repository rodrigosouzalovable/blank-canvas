import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

const SUGESTOES = [
  'Quero uma estratégia para clientes que nunca pagaram nenhuma parcela',
  'Como priorizar minha carteira de alto valor?',
  'Crie um plano de ação para inadimplentes com mais de 60 dias',
  'Sugira scripts de abordagem por WhatsApp para primeira cobrança',
];

async function buscarResumoCarteira(): Promise<string> {
  const [acordosRes, pagamentosRes, devedoresRes, acordosCpfRes] = await Promise.all([
    supabase.from('acordos').select('id, valor_total, dias_atraso, status').eq('status', 'ativo'),
    supabase.from('pagamentos').select('acordo_id, status, valor_parcela, data_prevista'),
    supabase.from('devedores').select('id, valor_atualizado, data_vencimento').eq('ativo', true),
    supabase.from('acordos').select('cliente_cpf').in('status', ['ativo', 'concluido']),
  ]);

  const acordos = acordosRes.data ?? [];
  const pagamentos = pagamentosRes.data ?? [];
  const devedores = devedoresRes.data ?? [];
  const cpfsComAcordo = new Set(
    (acordosCpfRes.data ?? []).map(a => (a.cliente_cpf ?? '').replace(/\D/g, '')).filter(Boolean)
  );

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Faixas de atraso dos pagamentos pendentes
  const faixas = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const valoresFaixa = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let nuncaPagaram = 0;
  let parcelaUnica = 0;

  const acordoIds = new Set(acordos.map(a => a.id));
  const pagsPorAcordo = new Map<string, typeof pagamentos>();
  for (const p of pagamentos) {
    if (!acordoIds.has(p.acordo_id)) continue;
    if (!pagsPorAcordo.has(p.acordo_id)) pagsPorAcordo.set(p.acordo_id, []);
    pagsPorAcordo.get(p.acordo_id)!.push(p);
  }

  for (const [, pags] of pagsPorAcordo) {
    const pagas = pags.filter(p => p.status === 'pago');
    const pendentes = pags.filter(p => p.status === 'pendente');

    if (pagas.length === 0 && pendentes.length > 0) nuncaPagaram++;
    if (pendentes.length === 1) parcelaUnica++;

    for (const p of pendentes) {
      const venc = new Date(p.data_prevista + 'T00:00:00');
      const dias = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86400000));
      const valor = Number(p.valor_parcela);
      if (dias <= 30) { faixas['0-30']++; valoresFaixa['0-30'] += valor; }
      else if (dias <= 60) { faixas['31-60']++; valoresFaixa['31-60'] += valor; }
      else if (dias <= 90) { faixas['61-90']++; valoresFaixa['61-90'] += valor; }
      else { faixas['90+']++; valoresFaixa['90+'] += valor; }
    }
  }

  const totalDevedoresSemAcordo = devedores.filter(d => {
    // sem CPF não dá pra cruzar, mas conta como sem acordo
    return true; // simplificado - conta todos os devedores ativos
  }).length;

  const valorTotalPendente = Object.values(valoresFaixa).reduce((a, b) => a + b, 0);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return `- Total de acordos ativos: ${acordos.length}
- Total de devedores cadastrados (ativos): ${devedores.length}
- Valor total pendente em parcelas: ${fmt(valorTotalPendente)}
- Distribuição por faixa de atraso (parcelas pendentes):
  - 0-30 dias: ${faixas['0-30']} parcelas (${fmt(valoresFaixa['0-30'])})
  - 31-60 dias: ${faixas['31-60']} parcelas (${fmt(valoresFaixa['31-60'])})
  - 61-90 dias: ${faixas['61-90']} parcelas (${fmt(valoresFaixa['61-90'])})
  - 90+ dias: ${faixas['90+']} parcelas (${fmt(valoresFaixa['90+'])})
- Acordos onde o cliente nunca pagou nenhuma parcela: ${nuncaPagaram}
- Acordos com apenas 1 parcela pendente: ${parcelaUnica}`;
}

export function EstrategiasCobranca() {
  const [prompt, setPrompt] = useState('');
  const [resposta, setResposta] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: resumoCarteira } = useQuery({
    queryKey: ['resumo-carteira-ia'],
    queryFn: buscarResumoCarteira,
    staleTime: 5 * 60 * 1000,
  });

  const gerarEstrategia = async (textoPrompt?: string) => {
    const finalPrompt = textoPrompt || prompt;
    if (!finalPrompt.trim()) {
      toast.error('Digite uma solicitação para gerar a estratégia.');
      return;
    }

    setIsLoading(true);
    setResposta('');

    abortRef.current = new AbortController();

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-estrategia-cobranca`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ prompt: finalPrompt, resumoCarteira: resumoCarteira ?? '' }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
        toast.error(err.error || 'Erro ao gerar estratégia');
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error('Sem body na resposta');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullText += content;
              setResposta(fullText);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // flush remaining
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullText += content;
              setResposta(fullText);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Erro ao gerar estratégia:', e);
        toast.error('Erro ao gerar estratégia. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSugestao = (s: string) => {
    setPrompt(s);
    gerarEstrategia(s);
  };

  const limpar = () => {
    if (abortRef.current) abortRef.current.abort();
    setResposta('');
    setPrompt('');
    setIsLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Gerador de Estratégias com IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sugestões */}
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isLoading}
              onClick={() => handleSugestao(s)}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {s}
            </Button>
          ))}
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <Textarea
            placeholder="Descreva a estratégia de cobrança que você precisa..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
          <div className="flex gap-2">
            <Button onClick={() => gerarEstrategia()} disabled={isLoading || !prompt.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-1" />
                  Gerar Estratégia
                </>
              )}
            </Button>
            {(resposta || isLoading) && (
              <Button variant="ghost" size="sm" onClick={limpar}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Resposta */}
        {resposta && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{resposta}</ReactMarkdown>
            </div>
          </div>
        )}

        {isLoading && !resposta && (
          <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analisando sua carteira e gerando estratégia...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
