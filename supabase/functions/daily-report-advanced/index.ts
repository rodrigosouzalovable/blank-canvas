import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DESTINO = "62991672674";

// === Helpers ===
function brasiliaNow(): Date {
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}

function dataBR(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateBR(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

async function sendViaUazapi(serverUrl: string, token: string, telefone: string, mensagem: string): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  const endpoints = [
    `${cleanUrl}/send/text`,
    `${cleanUrl}/message/sendText`,
    `${cleanUrl}/sendText`,
  ];
  let lastErr: any = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": token },
        body: JSON.stringify({ number: telefone, text: mensagem }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return;
      if (r.status !== 405) {
        throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
      }
      lastErr = data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Todos os endpoints falharam: ${lastErr instanceof Error ? lastErr.message : JSON.stringify(lastErr)}`);
}

async function gerarSugestoesIA(resumo: Record<string, any>): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return "✅ Sistema operando normalmente.";
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de aquecimento de WhatsApp. Receba métricas do dia e responda com 3 a 5 sugestões PRÁTICAS e CURTAS em português, uma por linha, começando com emoji (✅ ⚠️ 📈 💡). Sem introduções, apenas as sugestões. Tom direto.",
          },
          { role: "user", content: `Métricas de hoje:\n${JSON.stringify(resumo, null, 2)}` },
        ],
      }),
    });
    if (!r.ok) return "💡 Sistema sem sugestões automáticas hoje.";
    const j = await r.json();
    return j?.choices?.[0]?.message?.content?.trim() || "💡 Sem sugestões hoje.";
  } catch (e) {
    console.error("[Advanced Report] Erro IA:", e);
    return "💡 Sugestões da IA indisponíveis no momento.";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const agora = brasiliaNow();
    const hoje = dataBR(agora);
    const ontemDate = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const ontem = dataBR(ontemDate);
    const hojeStart = `${hoje}T00:00:00-03:00`;
    const hojeEnd = `${hoje}T23:59:59-03:00`;
    const ontemStart = `${ontem}T00:00:00-03:00`;
    const ontemEnd = `${ontem}T23:59:59-03:00`;

    console.log("[Advanced Report] Iniciando para", hoje);

    // === BUSCAR DADOS EM PARALELO ===
    const [
      { data: aquecInst },
      { data: instancias },
      { data: interacoesHoje },
      { data: conversasIA },
      { data: autosaveHoje },
      { data: autosaveOntem },
    ] = await Promise.all([
      supabase.from("whatsapp_aquecimento_instancias").select("*"),
      supabase.from("user_whatsapp_instances").select("id, nome, ativo, criado_em"),
      supabase
        .from("whatsapp_aquecimento_interacoes")
        .select("instancia_origem_id, instancia_destino_id, status, created_at")
        .gte("created_at", hojeStart)
        .lte("created_at", hojeEnd),
      supabase
        .from("whatsapp_conversas_ia")
        .select("instancia_origem_id, instancia_destino_id, total_trocas, inicio_em")
        .gte("inicio_em", hojeStart)
        .lte("inicio_em", hojeEnd),
      supabase.from("aquecimento_envios_autosave").select("instancia_id, enviado_em").gte("enviado_em", hojeStart).lte("enviado_em", hojeEnd),
      supabase.from("aquecimento_envios_autosave").select("id").gte("enviado_em", ontemStart).lte("enviado_em", ontemEnd),
    ]);

    const instMap = new Map<string, { nome: string; ativo: boolean; criado_em: string }>();
    for (const i of instancias || []) instMap.set(i.id, { nome: i.nome || i.id.substring(0, 8), ativo: i.ativo, criado_em: i.criado_em });
    const nomeOf = (id: string | null | undefined) => (id ? instMap.get(id)?.nome || id.substring(0, 8) : "?");

    // === SEÇÃO 1: VISÃO GERAL ===
    const total = (aquecInst || []).length;
    const ativas = (aquecInst || []).filter((i) => i.status === "ativo" || i.status === "EM_AQUECIMENTO");
    const aquecidas = (aquecInst || []).filter((i) => i.fase >= 5 || i.status === "AQUECIDO");
    const pausadas = (aquecInst || []).filter((i) => i.status === "pausado" || i.status === "PAUSADO" || i.status === "INATIVO" || i.status === "REMOVIDO");
    const totalInteracoes = (interacoesHoje || []).length;
    const enviadasOk = (interacoesHoje || []).filter((i) => i.status === "ENVIADO" || i.status === "RESPONDIDO").length;
    const taxaSucesso = totalInteracoes > 0 ? Math.round((enviadasOk / totalInteracoes) * 100) : 100;

    // === SEÇÃO 2: CONVERSAS IA ===
    const totalConversas = (conversasIA || []).length;
    const totalTrocas = (conversasIA || []).reduce((s, c: any) => s + (c.total_trocas || 0), 0);
    const mediaTrocas = totalConversas > 0 ? (totalTrocas / totalConversas).toFixed(1) : "0";

    // Agrupar por par
    const paresMap = new Map<string, number>();
    for (const c of conversasIA || []) {
      const a = c.instancia_origem_id || "";
      const b = c.instancia_destino_id || "";
      if (!a || !b) continue;
      const key = [a, b].sort().join("|");
      paresMap.set(key, (paresMap.get(key) || 0) + (c.total_trocas || 1));
    }
    const paresOrdenados = Array.from(paresMap.entries())
      .sort((a, b) => b[1] - a[1]);

    // === SEÇÃO 3: AUTO-SAVE ===
    const totalAutosave = (autosaveHoje || []).length;
    const totalAutosaveOntem = (autosaveOntem || []).length;
    const mediaAutosave = ativas.length > 0 ? (totalAutosave / ativas.length).toFixed(1) : "0";

    const autosavePorInst = new Map<string, number>();
    for (const e of autosaveHoje || []) {
      autosavePorInst.set(e.instancia_id, (autosavePorInst.get(e.instancia_id) || 0) + 1);
    }
    const top5 = Array.from(autosavePorInst.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Instâncias ativas que não enviaram autosave hoje
    const semEnvio: { id: string; motivo: string }[] = [];
    for (const inst of ativas) {
      if (!autosavePorInst.has(inst.instancia_id)) {
        let motivo = "sem ciclo hoje";
        if (inst.fase === 1) motivo = `Fase 1 (limite ${inst.limite_diario})`;
        else if (!instMap.get(inst.instancia_id)?.ativo) motivo = "instância desativada";
        semEnvio.push({ id: inst.instancia_id, motivo });
      }
    }

    // === SEÇÃO 4: FASES ===
    const porFase: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const proximasPromocoes: { id: string; faseAtual: number; faseNova: number; dias: number }[] = [];
    for (const inst of aquecInst || []) {
      const f = inst.fase || 1;
      if (porFase[f] !== undefined) porFase[f]++;
      const diasRestantes = 7 - (inst.dias_na_fase || 0);
      if (inst.fase_auto !== false && f < 5 && diasRestantes <= 3 && diasRestantes > 0) {
        proximasPromocoes.push({ id: inst.instancia_id, faseAtual: f, faseNova: f + 1, dias: diasRestantes });
      }
    }

    // === SEÇÃO 5: SAÚDE ===
    const tresDiasAtras = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const recemConectadas = (instancias || []).filter((i) => i.ativo && new Date(i.criado_em) >= tresDiasAtras);

    // Falhas por instância
    const falhasPorInst = new Map<string, { ok: number; fail: number }>();
    for (const i of interacoesHoje || []) {
      const id = i.instancia_origem_id;
      if (!id) continue;
      const cur = falhasPorInst.get(id) || { ok: 0, fail: 0 };
      if (i.status === "ENVIADO" || i.status === "RESPONDIDO") cur.ok++;
      else cur.fail++;
      falhasPorInst.set(id, cur);
    }
    const altasFalhas: { id: string; taxa: number }[] = [];
    for (const [id, v] of falhasPorInst.entries()) {
      const tot = v.ok + v.fail;
      if (tot >= 3) {
        const taxa = (v.fail / tot) * 100;
        if (taxa > 10) altasFalhas.push({ id, taxa: Math.round(taxa) });
      }
    }

    // === SEÇÃO 7: COMPARATIVO ===
    const variacaoAutosave = totalAutosaveOntem > 0
      ? Math.round(((totalAutosave - totalAutosaveOntem) / totalAutosaveOntem) * 100)
      : (totalAutosave > 0 ? 100 : 0);

    // Conversas IA ontem
    const { data: conversasOntem } = await supabase
      .from("whatsapp_conversas_ia")
      .select("id, total_trocas")
      .gte("inicio_em", ontemStart)
      .lte("inicio_em", ontemEnd);
    const totalConversasOntem = (conversasOntem || []).length;
    const variacaoConversas = totalConversasOntem > 0
      ? Math.round(((totalConversas - totalConversasOntem) / totalConversasOntem) * 100)
      : (totalConversas > 0 ? 100 : 0);

    // === SEÇÃO 6: SUGESTÕES IA ===
    const resumoParaIA = {
      total_instancias: total,
      ativas: ativas.length,
      pausadas: pausadas.length,
      aquecidas_fase5: aquecidas.length,
      conversas_ia_hoje: totalConversas,
      trocas_total: totalTrocas,
      autosave_hoje: totalAutosave,
      autosave_ontem: totalAutosaveOntem,
      sem_envio_autosave: semEnvio.length,
      taxa_sucesso_pct: taxaSucesso,
      distribuicao_fases: porFase,
      instancias_alta_falha: altasFalhas.length,
    };
    const sugestoesIA = await gerarSugestoesIA(resumoParaIA);

    // === MONTAR MENSAGEM ===
    const sep = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    let msg = `📊 *RELATÓRIO DIÁRIO - ${formatDateBR(hoje)}*\n${sep}\n\n`;

    // Seção 1
    msg += `📈 *VISÃO GERAL*\n`;
    msg += `├─ Total de instâncias: ${total}\n`;
    msg += `├─ Em aquecimento: ${ativas.length}\n`;
    msg += `├─ Aquecidas (Fase 5): ${aquecidas.length}\n`;
    msg += `├─ Pausadas/Inativas: ${pausadas.length}\n`;
    msg += `└─ Taxa de sucesso: ${taxaSucesso}%\n\n`;

    // Seção 2
    msg += `💬 *CONVERSAS IA (24h)*\n${sep}\n`;
    msg += `Conversas iniciadas: ${totalConversas}\n`;
    msg += `Trocas de mensagens: ${totalTrocas}\n`;
    msg += `Média por conversa: ${mediaTrocas}\n\n`;
    if (paresOrdenados.length > 0) {
      msg += `*Conversas realizadas:*\n`;
      const limit = Math.min(paresOrdenados.length, 20);
      for (let idx = 0; idx < limit; idx++) {
        const [key, trocas] = paresOrdenados[idx];
        const [a, b] = key.split("|");
        const prefix = idx === limit - 1 && paresOrdenados.length <= 20 ? "└─" : "├─";
        msg += `${prefix} 📱 ${nomeOf(a)} ↔️ ${nomeOf(b)} → ${trocas}\n`;
      }
      if (paresOrdenados.length > 20) msg += `└─ ...+${paresOrdenados.length - 20} pares\n`;
    } else {
      msg += `_Nenhuma conversa registrada hoje._\n`;
    }
    msg += `\n`;

    // Seção 3
    msg += `📤 *AUTO-SAVE (Contatos externos)*\n${sep}\n`;
    msg += `Total de envios: ${totalAutosave}\n`;
    msg += `Média por instância: ${mediaAutosave}\n\n`;
    if (top5.length > 0) {
      msg += `*TOP 5 que mais enviaram:*\n`;
      const medals = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
      top5.forEach(([id, qt], idx) => {
        const prefix = idx === top5.length - 1 ? "└─" : "├─";
        msg += `${prefix} ${medals[idx]} ${nomeOf(id)} → ${qt}\n`;
      });
      msg += `\n`;
    }
    if (semEnvio.length > 0) {
      msg += `⚠️ *Sem envio (${semEnvio.length}):*\n`;
      semEnvio.slice(0, 10).forEach((s, idx) => {
        const prefix = idx === Math.min(semEnvio.length, 10) - 1 ? "└─" : "├─";
        msg += `${prefix} ${nomeOf(s.id)} (${s.motivo})\n`;
      });
      if (semEnvio.length > 10) msg += `   ...+${semEnvio.length - 10}\n`;
    }
    msg += `\n`;

    // Seção 4
    msg += `📈 *DISTRIBUIÇÃO POR FASE*\n${sep}\n`;
    for (let f = 1; f <= 5; f++) {
      const c = porFase[f] || 0;
      msg += `Fase ${f}: ${c} (${pct(c, total)})\n`;
    }
    if (proximasPromocoes.length > 0) {
      msg += `\n*Próximas promoções (≤3 dias):*\n`;
      proximasPromocoes.slice(0, 10).forEach((p, idx) => {
        const prefix = idx === Math.min(proximasPromocoes.length, 10) - 1 ? "└─" : "├─";
        msg += `${prefix} 📱 ${nomeOf(p.id)} → Fase ${p.faseAtual}→${p.faseNova} em ${p.dias}d\n`;
      });
      if (proximasPromocoes.length > 10) msg += `   ...+${proximasPromocoes.length - 10}\n`;
    }
    msg += `\n`;

    // Seção 5
    msg += `🩺 *SAÚDE E ALERTAS*\n${sep}\n`;
    if (pausadas.length > 0) {
      msg += `⚠️ *Pausadas/Inativas (${pausadas.length}):*\n`;
      pausadas.slice(0, 10).forEach((p, idx) => {
        const prefix = idx === Math.min(pausadas.length, 10) - 1 ? "└─" : "├─";
        msg += `${prefix} 📱 ${nomeOf(p.instancia_id)} → ${p.status}\n`;
      });
      if (pausadas.length > 10) msg += `   ...+${pausadas.length - 10}\n`;
      msg += `\n`;
    }
    if (recemConectadas.length > 0) {
      msg += `✅ *Recém-cadastradas (3 dias):*\n`;
      recemConectadas.slice(0, 5).forEach((r, idx) => {
        const prefix = idx === Math.min(recemConectadas.length, 5) - 1 ? "└─" : "├─";
        const data = new Date(r.criado_em).toLocaleDateString("pt-BR");
        msg += `${prefix} 📱 ${r.nome || r.id.substring(0, 8)} → ${data}\n`;
      });
      msg += `\n`;
    }
    if (altasFalhas.length > 0) {
      msg += `⚠️ *Taxa de falha >10%:*\n`;
      altasFalhas.slice(0, 10).forEach((a, idx) => {
        const prefix = idx === Math.min(altasFalhas.length, 10) - 1 ? "└─" : "├─";
        msg += `${prefix} 📱 ${nomeOf(a.id)} → ${a.taxa}%\n`;
      });
      msg += `\n`;
    }
    if (pausadas.length === 0 && altasFalhas.length === 0) {
      msg += `✅ Nenhum alerta crítico.\n\n`;
    }

    // Seção 6
    msg += `💡 *SUGESTÕES DA IA*\n${sep}\n${sugestoesIA}\n\n`;

    // Seção 7
    msg += `📉 *COMPARATIVO COM ONTEM*\n${sep}\n`;
    const sigC = variacaoConversas >= 0 ? "+" : "";
    const sigA = variacaoAutosave >= 0 ? "+" : "";
    msg += `Conversas IA: ${totalConversas} (ontem: ${totalConversasOntem}) → ${sigC}${variacaoConversas}%\n`;
    msg += `Auto-save: ${totalAutosave} (ontem: ${totalAutosaveOntem}) → ${sigA}${variacaoAutosave}%\n\n`;

    msg += `${sep}\n🤖 _Sistema autônomo de aquecimento_`;

    console.log(`[Advanced Report] Mensagem montada (${msg.length} chars)`);

    // === FALLBACK DE ENVIO ===
    const { data: instParaEnvio } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token")
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    let enviado = false;
    let usadaId: string | null = null;
    let usadaNome: string | null = null;
    let ultimoErro = "";
    let tentativas = 0;

    for (const inst of instParaEnvio || []) {
      tentativas++;
      try {
        await sendViaUazapi(inst.server_url, inst.instance_token, DESTINO, msg);
        enviado = true;
        usadaId = inst.id;
        usadaNome = inst.nome || inst.id.substring(0, 8);
        console.log(`[Advanced Report] ✅ Enviado via ${usadaNome}`);
        break;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        console.log(`[Advanced Report] ❌ Falha em ${inst.nome}: ${ultimoErro}`);
        if (tentativas >= 8) break; // limita tentativas
      }
    }

    // === REGISTRAR ===
    await supabase.from("relatorios_diarios_enviados").upsert({
      data: hoje,
      conteudo: msg,
      status: enviado ? "ENVIADO" : (instParaEnvio?.length ? "FALHOU" : "PENDENTE"),
      instancia_utilizada_id: usadaId,
      instancia_utilizada_nome: usadaNome,
      tentativas,
      erro: enviado ? null : ultimoErro || "Sem instâncias ativas disponíveis",
      enviado_em: enviado ? new Date().toISOString() : null,
    }, { onConflict: "data" });

    return new Response(
      JSON.stringify({
        success: enviado,
        data: hoje,
        tentativas,
        instancia: usadaNome,
        erro: enviado ? null : ultimoErro,
        preview: msg.substring(0, 200),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: enviado ? 200 : 500 },
    );
  } catch (error) {
    console.error("[Advanced Report] Erro fatal:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
