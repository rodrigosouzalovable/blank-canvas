import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CredorConfig {
  credor_slug: string;
  telefone: string;
  frequencia: string;
  ativo: boolean;
}

const credorFilters: Record<string, { empresa: string; nome: string; dashboardSlug: string }> = {
  novomundo: { empresa: "ume_novo_mundo", nome: "Novo Mundo", dashboardSlug: "novomundo" },
  grupoaltum: { empresa: "GRUPO ALTUM", nome: "Grupo Altum", dashboardSlug: "grupoaltum" },
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatVariation(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "↑ ∞%" : "—";
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct).toFixed(1)}%`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo") || "semanal";

    if (!["semanal", "mensal"].includes(tipo)) {
      return new Response(JSON.stringify({ error: "tipo deve ser 'semanal' ou 'mensal'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get active credor configs
    const frequenciaFilter = tipo === "semanal"
      ? ["semanal", "ambos"]
      : ["mensal", "ambos"];

    const { data: configs, error: configError } = await supabase
      .from("credor_relatorio_config")
      .select("*")
      .eq("ativo", true)
      .in("frequencia", frequenciaFilter);

    if (configError) throw configError;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum credor ativo para este tipo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const results: { credor: string; success: boolean; error?: string }[] = [];

    for (const config of configs as CredorConfig[]) {
      try {
        const credorInfo = credorFilters[config.credor_slug];
        if (!credorInfo) {
          results.push({ credor: config.credor_slug, success: false, error: "Slug desconhecido" });
          continue;
        }

        const message = await buildReport(supabase, config, credorInfo, tipo, now);
        await sendWhatsApp(config.telefone, message);

        // Update last send timestamp
        const updateField = tipo === "semanal" ? "ultimo_envio_semanal" : "ultimo_envio_mensal";
        await supabase
          .from("credor_relatorio_config")
          .update({ [updateField]: now.toISOString() })
          .eq("credor_slug", config.credor_slug);

        results.push({ credor: config.credor_slug, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        console.error(`Erro ao enviar relatório para ${config.credor_slug}:`, msg);
        results.push({ credor: config.credor_slug, success: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro geral:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function buildReport(
  supabase: any,
  config: CredorConfig,
  credorInfo: { empresa: string; nome: string; dashboardSlug: string },
  tipo: string,
  now: Date
): Promise<string> {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Date ranges
  const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1);
  const firstDayNextMonth = new Date(currentYear, currentMonth + 1, 1);
  const firstDayPrevMonth = new Date(currentYear, currentMonth - 1, 1);

  const fmtDate = (d: Date) => d.toISOString().split("T")[0];

  // Get all acordos for this credor
  const { data: acordosCreador } = await supabase
    .from("acordos")
    .select("id, valor_total, criado_em, cliente_cpf")
    .eq("empresa", credorInfo.empresa);

  const acordoIds = new Set((acordosCreador || []).map((a: any) => a.id));

  // Current month acordos
  const acordosMesAtual = (acordosCreador || []).filter((a: any) => {
    const d = new Date(a.criado_em);
    return d >= firstDayCurrentMonth && d < firstDayNextMonth;
  });
  const qtdAcordosMes = acordosMesAtual.length;
  const valorAcordosMes = acordosMesAtual.reduce((s: number, a: any) => s + Number(a.valor_total), 0);
  const ticketMedio = qtdAcordosMes > 0 ? valorAcordosMes / qtdAcordosMes : 0;

  // Previous month acordos
  const acordosMesAnterior = (acordosCreador || []).filter((a: any) => {
    const d = new Date(a.criado_em);
    return d >= firstDayPrevMonth && d < firstDayCurrentMonth;
  });
  const qtdAcordosMesAnterior = acordosMesAnterior.length;
  const valorAcordosMesAnterior = acordosMesAnterior.reduce((s: number, a: any) => s + Number(a.valor_total), 0);
  const ticketMedioAnterior = qtdAcordosMesAnterior > 0 ? valorAcordosMesAnterior / qtdAcordosMesAnterior : 0;

  // Paid installments - current month
  const { data: pagMesAtual } = await supabase
    .from("pagamentos")
    .select("valor_parcela, acordo_id")
    .eq("status", "pago")
    .gte("data_paga", fmtDate(firstDayCurrentMonth))
    .lt("data_paga", fmtDate(firstDayNextMonth));

  const totalMesAtual = (pagMesAtual || [])
    .filter((p: any) => acordoIds.has(p.acordo_id))
    .reduce((s: number, p: any) => s + Number(p.valor_parcela), 0);

  // Paid installments - previous month
  const { data: pagMesAnterior } = await supabase
    .from("pagamentos")
    .select("valor_parcela, acordo_id")
    .eq("status", "pago")
    .gte("data_paga", fmtDate(firstDayPrevMonth))
    .lt("data_paga", fmtDate(firstDayCurrentMonth));

  const totalMesAnterior = (pagMesAnterior || [])
    .filter((p: any) => acordoIds.has(p.acordo_id))
    .reduce((s: number, p: any) => s + Number(p.valor_parcela), 0);

  // Conversion rate
  const { count: totalDevedores } = await supabase
    .from("devedores")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true)
    .ilike("credor", `%${credorInfo.empresa === "ume_novo_mundo" ? "novo_mundo" : credorInfo.empresa}%`);

  const cpfsComAcordo = new Set(
    (acordosCreador || [])
      .filter((a: any) => a.cliente_cpf)
      .map((a: any) => a.cliente_cpf.replace(/\D/g, ""))
  );
  const taxaConversao = totalDevedores && totalDevedores > 0
    ? (cpfsComAcordo.size / totalDevedores) * 100
    : 0;

  // Delinquency by aging bucket
  const today = fmtDate(now);
  const { data: parcelasVencidas } = await supabase
    .from("pagamentos")
    .select("valor_parcela, acordo_id, data_prevista")
    .eq("status", "pendente")
    .lt("data_prevista", today);

  const parcelasCredor = (parcelasVencidas || []).filter((p: any) => acordoIds.has(p.acordo_id));

  const faixas = { "1-30": { qtd: 0, valor: 0 }, "31-60": { qtd: 0, valor: 0 }, "61-90": { qtd: 0, valor: 0 }, "90+": { qtd: 0, valor: 0 } };

  for (const p of parcelasCredor) {
    const diasAtraso = Math.floor((now.getTime() - new Date(p.data_prevista).getTime()) / (1000 * 60 * 60 * 24));
    const valor = Number(p.valor_parcela);
    if (diasAtraso <= 30) { faixas["1-30"].qtd++; faixas["1-30"].valor += valor; }
    else if (diasAtraso <= 60) { faixas["31-60"].qtd++; faixas["31-60"].valor += valor; }
    else if (diasAtraso <= 90) { faixas["61-90"].qtd++; faixas["61-90"].valor += valor; }
    else { faixas["90+"].qtd++; faixas["90+"].valor += valor; }
  }

  // Build message based on type
  if (tipo === "semanal") {
    // Week range
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const fmtBR = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Week payments
    const { data: pagSemana } = await supabase
      .from("pagamentos")
      .select("valor_parcela, acordo_id")
      .eq("status", "pago")
      .gte("data_paga", fmtDate(weekStart))
      .lte("data_paga", fmtDate(weekEnd));

    const totalSemana = (pagSemana || [])
      .filter((p: any) => acordoIds.has(p.acordo_id))
      .reduce((s: number, p: any) => s + Number(p.valor_parcela), 0);

    const acordosSemana = (acordosCreador || []).filter((a: any) => {
      const d = new Date(a.criado_em);
      return d >= weekStart && d <= weekEnd;
    }).length;

    return `📊 *RELATÓRIO SEMANAL - ${credorInfo.nome}*
Semana de ${fmtBR(weekStart)} a ${fmtBR(weekEnd)}/${now.getFullYear()}

💰 *RECUPERAÇÃO NA SEMANA:*
• Valor recuperado: ${formatCurrency(totalSemana)}
• Acordos fechados: ${acordosSemana}

📈 *ACUMULADO DO MÊS:*
• Total recuperado: ${formatCurrency(totalMesAtual)}
• Total de acordos: ${qtdAcordosMes}
• Ticket médio: ${formatCurrency(ticketMedio)}

⚠️ *INADIMPLÊNCIA POR FAIXA:*
• 1-30 dias: ${faixas["1-30"].qtd} parcelas (${formatCurrency(faixas["1-30"].valor)})
• 31-60 dias: ${faixas["31-60"].qtd} parcelas (${formatCurrency(faixas["31-60"].valor)})
• 61-90 dias: ${faixas["61-90"].qtd} parcelas (${formatCurrency(faixas["61-90"].valor)})
• 90+ dias: ${faixas["90+"].qtd} parcelas (${formatCurrency(faixas["90+"].valor)})

📊 vs mês anterior: ${formatVariation(totalMesAtual, totalMesAnterior)}`;
  }

  // Monthly report
  const mesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const mesRef = currentMonth === 0 ? 11 : currentMonth - 1;
  const anoRef = currentMonth === 0 ? currentYear - 1 : currentYear;
  const mesAnteriorAbrev = mesNomes[mesRef].substring(0, 3).toLowerCase();

  // Get token for dashboard link
  const { data: tokenData } = await supabase
    .from("credor_tokens")
    .select("token")
    .eq("credor_slug", config.credor_slug)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  const dashboardLink = tokenData
    ? `\n🔗 Dashboard: minhacomissao.lovable.app/credor/${credorInfo.dashboardSlug}/dashboard?token=${tokenData.token}`
    : "";

  return `📊 *RELATÓRIO MENSAL - ${credorInfo.nome}*
Referência: ${mesNomes[mesRef]}/${anoRef}

💰 *RESULTADOS DO MÊS:*
• Valor total recuperado: ${formatCurrency(totalMesAnterior)}
• Acordos fechados: ${qtdAcordosMesAnterior}
• Ticket médio: ${formatCurrency(ticketMedioAnterior)}
• Taxa de conversão: ${taxaConversao.toFixed(1)}%

⚠️ *INADIMPLÊNCIA POR FAIXA:*
• 1-30 dias: ${faixas["1-30"].qtd} parcelas (${formatCurrency(faixas["1-30"].valor)})
• 31-60 dias: ${faixas["31-60"].qtd} parcelas (${formatCurrency(faixas["31-60"].valor)})
• 61-90 dias: ${faixas["61-90"].qtd} parcelas (${formatCurrency(faixas["61-90"].valor)})
• 90+ dias: ${faixas["90+"].qtd} parcelas (${formatCurrency(faixas["90+"].valor)})

📊 *COMPARATIVO:*
• Recuperação: ${formatVariation(totalMesAnterior, totalMesAtual)} vs ${mesAnteriorAbrev}/${anoRef > 2000 ? String(anoRef).slice(-2) : anoRef}
• Acordos: ${formatVariation(qtdAcordosMesAnterior, qtdAcordosMes)} vs ${mesAnteriorAbrev}/${String(anoRef).slice(-2)}
• Ticket médio: ${formatVariation(ticketMedioAnterior, ticketMedio)} vs ${mesAnteriorAbrev}/${String(anoRef).slice(-2)}${dashboardLink}`;
}

async function sendWhatsApp(telefone: string, mensagem: string): Promise<void> {
  const serverUrl = Deno.env.get("UAZAPI_SERVER_URL");
  const instanceToken = Deno.env.get("UAZAPI_INSTANCE_TOKEN");

  if (!serverUrl || !instanceToken) {
    throw new Error("Credenciais UAZAPI não configuradas");
  }

  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
    `${cleanUrl}/send/text`,
  ];

  let lastError: any = null;
  for (const url of endpoints) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": instanceToken },
      body: JSON.stringify({ number: telefone, text: mensagem }),
    });
    const data = await response.json();
    if (response.ok) return;
    lastError = data;
  }

  throw new Error(lastError?.message || "Erro ao enviar via UAZAPI");
}
