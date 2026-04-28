import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando limpeza automática de acordos...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const hoje = new Date();
    const trintaDiasAtras = new Date(hoje);
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const trintaDiasAtrasStr = trintaDiasAtras.toISOString().split('T')[0];

    let excluidos = 0;
    let quebrados = 0;

    // ===== PASSO 1: Excluir acordos sem nenhuma parcela paga =====
    // Buscar todos os acordos ativos
    const { data: acordosAtivos, error: acordosErr } = await supabase
      .from('acordos')
      .select('id')
      .eq('status', 'ativo');

    if (acordosErr) {
      console.error('Erro ao buscar acordos ativos:', acordosErr);
      throw acordosErr;
    }

    for (const acordo of (acordosAtivos || [])) {
      // Verificar se tem alguma parcela paga
      const { data: parcelasPagas, error: ppErr } = await supabase
        .from('pagamentos')
        .select('id')
        .eq('acordo_id', acordo.id)
        .eq('status', 'pago')
        .limit(1);

      if (ppErr) {
        console.error(`Erro ao verificar parcelas pagas do acordo ${acordo.id}:`, ppErr);
        continue;
      }

      const temPagamento = parcelasPagas && parcelasPagas.length > 0;

      if (!temPagamento) {
        // Sem nenhuma parcela paga - verificar primeiro vencimento
        const { data: primeiraParcela, error: prErr } = await supabase
          .from('pagamentos')
          .select('data_prevista')
          .eq('acordo_id', acordo.id)
          .order('data_prevista', { ascending: true })
          .limit(1);

        if (prErr || !primeiraParcela || primeiraParcela.length === 0) continue;

        if (primeiraParcela[0].data_prevista <= trintaDiasAtrasStr) {
          // 30+ dias sem pagamento - excluir acordo e parcelas
          console.log(`Excluindo acordo ${acordo.id} (sem pagamentos, vencido há 30+ dias)`);
          
          const { error: delPagErr } = await supabase
            .from('pagamentos')
            .delete()
            .eq('acordo_id', acordo.id);

          if (delPagErr) {
            console.error(`Erro ao excluir pagamentos do acordo ${acordo.id}:`, delPagErr);
            continue;
          }

          const { error: delAcErr } = await supabase
            .from('acordos')
            .delete()
            .eq('id', acordo.id);

          if (delAcErr) {
            console.error(`Erro ao excluir acordo ${acordo.id}:`, delAcErr);
            continue;
          }

          excluidos++;
        }
      } else {
        // ===== PASSO 2: Quebrar acordos com parcelas atrasadas =====
        // Tem parcelas pagas - verificar próxima parcela pendente
        const { data: proximaPendente, error: pnErr } = await supabase
          .from('pagamentos')
          .select('data_prevista')
          .eq('acordo_id', acordo.id)
          .eq('status', 'pendente')
          .order('data_prevista', { ascending: true })
          .limit(1);

        if (pnErr || !proximaPendente || proximaPendente.length === 0) continue;

        if (proximaPendente[0].data_prevista <= trintaDiasAtrasStr) {
          // Próxima parcela pendente vencida há 30+ dias - quebrar acordo
          console.log(`Quebrando acordo ${acordo.id} (parcela pendente vencida há 30+ dias)`);
          
          // Excluir todas as parcelas pendentes
          const { error: delPendErr } = await supabase
            .from('pagamentos')
            .delete()
            .eq('acordo_id', acordo.id)
            .eq('status', 'pendente');

          if (delPendErr) {
            console.error(`Erro ao excluir parcelas pendentes do acordo ${acordo.id}:`, delPendErr);
            continue;
          }

          // Atualizar status do acordo para quebrado
          const { error: updErr } = await supabase
            .from('acordos')
            .update({ status: 'quebrado' })
            .eq('id', acordo.id);

          if (updErr) {
            console.error(`Erro ao atualizar status do acordo ${acordo.id}:`, updErr);
            continue;
          }

          quebrados++;
        }
      }
    }

    console.log(`Limpeza concluída: ${excluidos} excluído(s), ${quebrados} quebrado(s)`);

    return new Response(JSON.stringify({
      success: true,
      excluidos,
      quebrados,
      total_verificados: acordosAtivos?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na função cleanup-acordos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
