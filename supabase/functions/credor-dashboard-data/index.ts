import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const token = url.searchParams.get("token");

    if (!slug || !token) {
      return new Response(
        JSON.stringify({ error: "slug e token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("credor_tokens")
      .select("*")
      .eq("credor_slug", slug)
      .eq("token", token)
      .eq("ativo", true)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou credor não encontrado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine credor filter based on slug
    const credorFilters: Record<string, string> = {
      novomundo: "ume_novo_mundo",
      grupoaltum: "GRUPO ALTUM",
    };
    const empresaFilter = credorFilters[slug] || slug;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const firstDayNextMonth = new Date(currentYear, currentMonth + 1, 1).toISOString();
    const firstDayPrevMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();

    // 1. Total recovered all-time (paid installments)
    const { data: totalAllTime } = await supabase
      .from("pagamentos")
      .select("valor_parcela, acordo_id")
      .eq("status", "pago");

    // Get all acordos for this credor
    const { data: acordosCreador } = await supabase
      .from("acordos")
      .select("id, valor_total, criado_em, cliente_cpf")
      .eq("empresa", empresaFilter);

    const acordoIds = new Set((acordosCreador || []).map((a) => a.id));

    // Filter pagamentos to only this credor's acordos
    const pagamentosCreador = (totalAllTime || []).filter((p) =>
      acordoIds.has(p.acordo_id)
    );
    const totalRecuperado = pagamentosCreador.reduce(
      (sum, p) => sum + Number(p.valor_parcela),
      0
    );

    // 2. Current month recovered
    const { data: pagamentosMesAtual } = await supabase
      .from("pagamentos")
      .select("valor_parcela, acordo_id, data_paga")
      .eq("status", "pago")
      .gte("data_paga", firstDayCurrentMonth.split("T")[0])
      .lt("data_paga", firstDayNextMonth.split("T")[0]);

    const pagMesAtualCreador = (pagamentosMesAtual || []).filter((p) =>
      acordoIds.has(p.acordo_id)
    );
    const totalMesAtual = pagMesAtualCreador.reduce(
      (sum, p) => sum + Number(p.valor_parcela),
      0
    );

    // 3. Previous month recovered
    const { data: pagamentosMesAnterior } = await supabase
      .from("pagamentos")
      .select("valor_parcela, acordo_id, data_paga")
      .eq("status", "pago")
      .gte("data_paga", firstDayPrevMonth.split("T")[0])
      .lt("data_paga", firstDayCurrentMonth.split("T")[0]);

    const pagMesAntCreador = (pagamentosMesAnterior || []).filter((p) =>
      acordoIds.has(p.acordo_id)
    );
    const totalMesAnterior = pagMesAntCreador.reduce(
      (sum, p) => sum + Number(p.valor_parcela),
      0
    );

    // 4. Acordos current month
    const acordosMesAtual = (acordosCreador || []).filter((a) => {
      const d = new Date(a.criado_em);
      return d >= new Date(firstDayCurrentMonth) && d < new Date(firstDayNextMonth);
    });
    const qtdAcordosMes = acordosMesAtual.length;
    const valorAcordosMes = acordosMesAtual.reduce(
      (sum, a) => sum + Number(a.valor_total),
      0
    );

    // Acordos previous month
    const acordosMesAnterior = (acordosCreador || []).filter((a) => {
      const d = new Date(a.criado_em);
      return d >= new Date(firstDayPrevMonth) && d < new Date(firstDayCurrentMonth);
    });
    const qtdAcordosMesAnterior = acordosMesAnterior.length;

    // 5. Ticket médio
    const ticketMedio = qtdAcordosMes > 0 ? valorAcordosMes / qtdAcordosMes : 0;
    const ticketMedioAnterior =
      acordosMesAnterior.length > 0
        ? acordosMesAnterior.reduce((s, a) => s + Number(a.valor_total), 0) /
          acordosMesAnterior.length
        : 0;

    // 6. Conversion rate: CPFs with devedores that generated acordos
    const { count: totalDevedores } = await supabase
      .from("devedores")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .ilike("credor", `%${empresaFilter === "ume_novo_mundo" ? "novo_mundo" : empresaFilter}%`);

    const cpfsComAcordo = new Set(
      (acordosCreador || [])
        .filter((a) => a.cliente_cpf)
        .map((a) => a.cliente_cpf!.replace(/\D/g, ""))
    );
    const taxaConversao =
      totalDevedores && totalDevedores > 0
        ? (cpfsComAcordo.size / totalDevedores) * 100
        : 0;

    // 7. Last 6 months time series
    const seriesMensal: { mes: string; valor: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const mesLabel = d.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      });
      const inicio = new Date(d.getFullYear(), d.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        .toISOString()
        .split("T")[0];

      const { data: pagMes } = await supabase
        .from("pagamentos")
        .select("valor_parcela, acordo_id")
        .eq("status", "pago")
        .gte("data_paga", inicio)
        .lt("data_paga", fim);

      const totalMes = (pagMes || [])
        .filter((p) => acordoIds.has(p.acordo_id))
        .reduce((s, p) => s + Number(p.valor_parcela), 0);

      seriesMensal.push({ mes: mesLabel, valor: totalMes });
    }

    const response = {
      totalRecuperado,
      totalMesAtual,
      totalMesAnterior,
      qtdAcordosMes,
      qtdAcordosMesAnterior,
      valorAcordosMes,
      ticketMedio,
      ticketMedioAnterior,
      taxaConversao,
      seriesMensal,
      totalDevedores: totalDevedores || 0,
      totalAcordos: (acordosCreador || []).length,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
