import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";
import { salvarContatoAgendaCacheado, nomeAmigavelInstancia } from "../_shared/agenda-contatos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    // ========== MANUAL TEST MODE ==========
    if (body?.action === "manual-test") {
      return await handleManualTest(supabase, body, supabaseUrl, supabaseKey);
    }

    console.log("[AQUECIMENTO] Iniciando ciclo...");

    const now = new Date();
    const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = spTime.getHours();
    const dayOfWeek = spTime.getDay();

    if (hour < 7 || hour >= 21) {
      console.log(`[AQUECIMENTO] Fora do horário (${hour}h). Pulando.`);
      return json({ message: "Fora do horário" });
    }

    // Load config
    const { data: configRows } = await supabase.from("whatsapp_aquecimento_config").select("*");
    const config: Record<string, any> = {};
    (configRows || []).forEach((c: any) => { config[c.chave] = c.valor; });

    const diasAtivos: number[] = config.dias_ativos || [1, 2, 3, 4, 5, 6];
    if (!diasAtivos.includes(dayOfWeek)) {
      console.log(`[AQUECIMENTO] Dia ${dayOfWeek} não ativo.`);
      return json({ message: "Dia não ativo" });
    }

    // ========== AUTO-ENROLLMENT (ALL USERS) ==========
    const { data: allActiveInstances } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token, criado_em, ativo, user_id")
      .eq("ativo", true);

    const { data: existingAquec } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("instancia_id, status")
      .neq("status", "REMOVIDO");

    const existingIds = new Set((existingAquec || []).map((e: any) => e.instancia_id));

    const MATURACAO_DIAS = 5;
    for (const inst of (allActiveInstances || []).filter((i: any) => !existingIds.has(i.id))) {
      const idadeDias = (Date.now() - new Date(inst.criado_em).getTime()) / 86400000;
      const statusInicial = idadeDias < MATURACAO_DIAS ? "AGUARDANDO_MATURACAO" : "EM_AQUECIMENTO";

      const { data: removed } = await supabase
        .from("whatsapp_aquecimento_instancias")
        .select("id")
        .eq("instancia_id", inst.id)
        .eq("status", "REMOVIDO")
        .maybeSingle();

      if (removed) {
        await supabase.from("whatsapp_aquecimento_instancias").update({
          status: statusInicial, fase: 1, limite_diario: 15,
        }).eq("id", removed.id);
      } else {
        await supabase.from("whatsapp_aquecimento_instancias").insert({
          instancia_id: inst.id, status: statusInicial, fase: 1,
          fase_auto: true, limite_diario: 15, dias_na_fase: 0,
          interacoes_hoje: 0, interacoes_total: 0, respostas_recebidas: 0,
        });
      }
      console.log(`[AQUECIMENTO] Auto-enrolled: ${inst.nome} (${statusInicial}, idade ${idadeDias.toFixed(1)}d)`);
    }

    // ========== PROMOÇÃO: AGUARDANDO_MATURACAO → EM_AQUECIMENTO (após 5 dias) ==========
    const { data: aguardando } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("id, instancia_id")
      .eq("status", "AGUARDANDO_MATURACAO");

    let promovidos = 0;
    for (const aw of (aguardando || [])) {
      const inst = (allActiveInstances || []).find((i: any) => i.id === aw.instancia_id);
      if (!inst) continue;
      const idadeDias = (Date.now() - new Date(inst.criado_em).getTime()) / 86400000;
      if (idadeDias >= MATURACAO_DIAS) {
        await supabase.from("whatsapp_aquecimento_instancias")
          .update({ status: "EM_AQUECIMENTO" }).eq("id", aw.id);
        promovidos++;
        console.log(`[AQUECIMENTO] 🎓 Promovido após maturação: ${inst.nome} (${idadeDias.toFixed(1)}d)`);
      }
    }
    if (promovidos > 0) console.log(`[AQUECIMENTO] ${promovidos} instâncias promovidas para EM_AQUECIMENTO`);

    // ========== SYNC: PAUSE DEACTIVATED INSTANCES ==========
    const { data: allInstances } = await supabase
      .from("user_whatsapp_instances")
      .select("id, ativo");

    const activeInstanceIds = new Set((allActiveInstances || []).map((i: any) => i.id));

    const { data: allAquecInstances } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("id, instancia_id, status")
      .not("status", "eq", "REMOVIDO");

    for (const aquec of (allAquecInstances || [])) {
      const mainInst = (allInstances || []).find((i: any) => i.id === aquec.instancia_id);
      if (mainInst && !mainInst.ativo && aquec.status !== "PAUSADO") {
        await supabase.from("whatsapp_aquecimento_instancias")
          .update({ status: "PAUSADO" }).eq("id", aquec.id);
        console.log(`[AQUECIMENTO] ⏸️ Pausado (desativado): ${aquec.instancia_id}`);
      }
    }

    // ========== AUTO-REACTIVATE PAUSED INSTANCES ==========
    const { data: pausedInstances } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("id, instancia_id")
      .eq("status", "PAUSADO");

    let reativados = 0;
    for (const paused of (pausedInstances || [])) {
      if (activeInstanceIds.has(paused.instancia_id)) {
        await supabase.from("whatsapp_aquecimento_instancias")
          .update({ status: "EM_AQUECIMENTO" }).eq("id", paused.id);
        reativados++;
      }
    }
    if (reativados > 0) {
      console.log(`[AQUECIMENTO] ✅ Reativados ${reativados} instâncias PAUSADO → EM_AQUECIMENTO`);
    }

    // ========== SWEEP: ADD PENDING INSTANCES TO WARMING GROUP ==========
    try {
      const sweepRes = await fetch(`${supabaseUrl}/functions/v1/add-to-warming-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({}),
      });
      const sweepText = await sweepRes.text();
      console.log(`[AQUECIMENTO] Group sweep: ${sweepText.substring(0, 200)}`);
    } catch (e) {
      console.error("[AQUECIMENTO] Group sweep error:", e);
    }

    // ========== GET ALL WARMING INSTANCES ==========
    const { data: instancias } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("*")
      .in("status", ["EM_AQUECIMENTO", "AQUECIDO"]);

    if (!instancias || instancias.length < 2) {
      console.log(`[AQUECIMENTO] Menos de 2 instâncias ativas (${instancias?.length || 0}).`);
      return json({ message: "Menos de 2 instâncias" });
    }

    console.log(`[AQUECIMENTO] ${instancias.length} instâncias ativas para aquecimento.`);

    const instanciaIds = instancias.map((i: any) => i.instancia_id);
    const { data: whatsappInstances } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token, criado_em, user_id")
      .in("id", instanciaIds);

    const instanceMap = new Map((whatsappInstances || []).map((i: any) => [i.id, i]));

    // ========== GROUP INSTANCES BY USER ==========
    const instancesByUser = new Map<string, any[]>();
    for (const inst of instancias) {
      const details = instanceMap.get(inst.instancia_id);
      if (!details) continue;
      const userId = details.user_id;
      if (!instancesByUser.has(userId)) instancesByUser.set(userId, []);
      instancesByUser.get(userId)!.push({ ...inst, details });
    }

    // ========== RAMPA REAL POR FASE ==========
    // Pares de conversa iniciados por instância/dia. Cada par dispara cascata de 4-10 trocas via webhook.
    const PARES_POR_FASE: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
    // Fator fim-de-semana: sábado 60%, domingo 40% — mínimo 1
    const fatorDia = dayOfWeek === 0 ? 0.4 : dayOfWeek === 6 ? 0.6 : 1.0;
    const computeTarget = (fase: number) => {
      const base = PARES_POR_FASE[fase] ?? 1;
      return Math.max(1, Math.round(base * fatorDia));
    };
    const MAX_PAIRS_PER_CYCLE = 12;
    // Pausa de almoço (12-14h BRT)
    if (hour >= 12 && hour < 14) {
      console.log("[AQUECIMENTO] 🍽️ Pausa de almoço (12-14h). Pulando ciclo.");
      return json({ message: "Lunch break", skipped: true });
    }

    console.log(`[AQUECIMENTO] 🎯 Rampa por fase ativa (fator dia ${fatorDia}): F1=${computeTarget(1)} F2=${computeTarget(2)} F3=${computeTarget(3)} F4=${computeTarget(4)} F5=${computeTarget(5)}`);

    // ========== RESET DAILY COUNTERS ==========
    for (const inst of instancias) {
      if (inst.ultima_interacao) {
        const lastDate = new Date(inst.ultima_interacao).toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" });
        const todayDate = spTime.toLocaleDateString("en-US");
        if (lastDate !== todayDate) {
          await supabase.from("whatsapp_aquecimento_instancias")
            .update({ interacoes_hoje: 0 }).eq("id", inst.id);
          inst.interacoes_hoje = 0;
        }
      }
    }

    let totalEnviados = 0;

    // ========== PROCESS EACH USER'S INSTANCES SEPARATELY ==========
    for (const [userId, userInstances] of instancesByUser.entries()) {
      // Filter eligible — cada instância tem seu próprio target baseado na fase
      const eligible = userInstances.filter((inst: any) => {
        const target = computeTarget(inst.fase || 1);
        return (inst.interacoes_hoje || 0) < target;
      });

      if (eligible.length < 2) {
        console.log(`[AQUECIMENTO] User ${userId}: ${eligible.length} elegíveis, precisa de 2+. Pulando.`);
        continue;
      }

      console.log(`[AQUECIMENTO] User ${userId}: ${eligible.length} elegíveis de ${userInstances.length}. ` +
        eligible.slice(0, 5).map((i: any) => `${i.details?.nome || i.instancia_id}=F${i.fase}(${i.interacoes_hoje || 0}/${computeTarget(i.fase || 1)})`).join(' '));

      // ========== GENERATE PAIRS (same user only) ==========
      // Prioriza quem tem MENOS interações hoje (garante cobertura de todas as instâncias)
      // Dentro do mesmo nível de interações_hoje, ordem aleatória para variar parceiros
      const shuffled = [...eligible].sort((a: any, b: any) => {
        const diff = (a.interacoes_hoje || 0) - (b.interacoes_hoje || 0);
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
      });
      const allPairs: [any, any][] = [];
      const usedIds = new Set<string>();

      // First pass: 30% affinity with last partner
      for (const inst of shuffled) {
        if (usedIds.has(inst.id)) continue;
        if (inst.ultimo_parceiro_id && Math.random() < 0.30) {
          const partner = shuffled.find((p: any) => p.instancia_id === inst.ultimo_parceiro_id && !usedIds.has(p.id));
          if (partner) {
            allPairs.push([inst, partner]);
            usedIds.add(inst.id);
            usedIds.add(partner.id);
          }
        }
      }

      // Second pass: random pairs for remaining
      const remaining = shuffled.filter((i: any) => !usedIds.has(i.id));
      for (let i = 0; i + 1 < remaining.length; i += 2) {
        allPairs.push([remaining[i], remaining[i + 1]]);
      }

      const pairs = allPairs.sort(() => Math.random() - 0.5).slice(0, MAX_PAIRS_PER_CYCLE);

      for (const [instA, instB] of pairs) {
        const detailsA = instA.details;
        const detailsB = instB.details;
        if (!detailsA || !detailsB) continue;

        // Check if same pair already had conversation today
        // Cooldown 2-4h por par (sorteado): evita repetição muito próxima
        const cooldownMs = (2 + Math.random() * 2) * 60 * 60 * 1000;
        const cooldownIso = new Date(Date.now() - cooldownMs).toISOString();
        const { data: conversaRecente } = await supabase
          .from("whatsapp_conversas_ia")
          .select("id")
          .or(`and(instancia_origem_id.eq.${instA.instancia_id},instancia_destino_id.eq.${instB.instancia_id}),and(instancia_origem_id.eq.${instB.instancia_id},instancia_destino_id.eq.${instA.instancia_id})`)
          .gte("inicio_em", cooldownIso)
          .limit(1)
          .maybeSingle();

        if (conversaRecente) continue;


        const phoneA = detailsA.nome?.match(/^\d+/)?.[0] || "";
        const phoneB = detailsB.nome?.match(/^\d+/)?.[0] || "";
        if (!phoneA || !phoneB) continue;

        const destNum = `55${phoneB}@s.whatsapp.net`;
        const origNum = `55${phoneA}@s.whatsapp.net`;

        console.log(`[AQUECIMENTO] 🤝 Par: ${detailsA.nome} → ${detailsB.nome} (user: ${userId})`);

        // PRE-SAVE bidirecional: salva A na agenda de B e B na agenda de A (cacheado)
        try {
          const nomeA = nomeAmigavelInstancia(detailsA.nome, phoneA);
          const nomeB = nomeAmigavelInstancia(detailsB.nome, phoneB);
          await Promise.all([
            salvarContatoAgendaCacheado(supabase, instA.instancia_id, detailsA.server_url, detailsA.instance_token, `55${phoneB}`, nomeB),
            salvarContatoAgendaCacheado(supabase, instB.instancia_id, detailsB.server_url, detailsB.instance_token, `55${phoneA}`, nomeA),
          ]);
        } catch (e) {
          console.log(`[AQUECIMENTO] pre-save agenda erro: ${e}`);
        }

        const iaPayload = {
          action: "iniciar-conversa",
          instancia_origem_id: instA.instancia_id,
          instancia_destino_id: instB.instancia_id,
          server_url: detailsA.server_url,
          instance_token: detailsA.instance_token,
          numero_destino: destNum,
          numero_origem: origNum,
          dest_server_url: detailsB.server_url,
          dest_instance_token: detailsB.instance_token,
        };

        try {
          const iaRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ia-responder`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify(iaPayload),
          });
          const iaText = await iaRes.text();
          console.log(`[AQUECIMENTO] IA response ${detailsA.nome}→${detailsB.nome}: ${iaText.substring(0, 200)}`);

          const lower = iaText.toLowerCase();
          if (lower.includes("disconnected") || lower.includes("desconectado") || lower.includes("not connected")) {
            if (lower.includes(phoneA) || iaText.includes(instA.instancia_id)) {
              console.log(`[AQUECIMENTO] ⚠️ ${detailsA.nome} desconectado → PAUSADO`);
              await supabase.from("whatsapp_aquecimento_instancias").update({ status: "PAUSADO" }).eq("id", instA.id);
            }
            if (lower.includes(phoneB) || iaText.includes(instB.instancia_id)) {
              console.log(`[AQUECIMENTO] ⚠️ ${detailsB.nome} desconectado → PAUSADO`);
              await supabase.from("whatsapp_aquecimento_instancias").update({ status: "PAUSADO" }).eq("id", instB.id);
            }
          }
        } catch (e) {
          console.error(`[AQUECIMENTO] IA call error ${detailsA.nome}→${detailsB.nome}:`, e);
        }

        // Update counters
        await supabase.from("whatsapp_aquecimento_instancias").update({
          interacoes_hoje: (instA.interacoes_hoje || 0) + 1,
          interacoes_total: (instA.interacoes_total || 0) + 1,
          ultima_interacao: new Date().toISOString(),
          ultimo_parceiro_id: instB.instancia_id,
        }).eq("id", instA.id);

        await supabase.from("whatsapp_aquecimento_instancias").update({
          ultimo_parceiro_id: instA.instancia_id,
        }).eq("id", instB.id);

        totalEnviados++;

        // Small delay between pairs (8-23s, anti-ban mantido)
        await new Promise(r => setTimeout(r, 8000 + Math.random() * 15000));
      }
    }

    console.log(`[AQUECIMENTO] Ciclo concluído. ${totalEnviados} conversas iniciadas.`);

    // Auto-save agora roda em cron próprio (autosave-aquecimento-horario) — não chamar mais aqui.

    return json({ success: true, conversas_iniciadas: totalEnviados, reativados });

  } catch (err) {
    console.error("[AQUECIMENTO] Erro:", err);
    return json({ error: String(err) }, 500);
  }
});

// ========== MANUAL TEST ==========
async function handleManualTest(supabase: any, body: any, supabaseUrl: string, supabaseKey: string) {
  const instanceIds: string[] = body.instance_ids || [];
  if (instanceIds.length < 2) {
    return json({ error: "Selecione pelo menos 2 instâncias" }, 400);
  }

  const { data: whatsappInsts } = await supabase
    .from("user_whatsapp_instances")
    .select("id, nome, server_url, instance_token")
    .in("id", instanceIds);

  if (!whatsappInsts || whatsappInsts.length < 2) {
    return json({ error: "Instâncias não encontradas" }, 404);
  }

  const shuffled = [...whatsappInsts].sort(() => Math.random() - 0.5);
  const pairs: [any, any][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  let enviados = 0;
  const results: any[] = [];

  for (const [from, to] of pairs) {
    const toPhone = to.nome?.match(/^\d+/)?.[0] || "";
    const fromPhone = from.nome?.match(/^\d+/)?.[0] || "";
    if (!toPhone || !fromPhone) {
      results.push({ from: from.nome, to: to.nome, status: "ERRO", motivo: "Sem telefone" });
      continue;
    }

    const destNum = `55${toPhone}@s.whatsapp.net`;
    const origNum = `55${fromPhone}@s.whatsapp.net`;

    const iaPayload = {
      action: "iniciar-conversa",
      instancia_origem_id: from.id,
      instancia_destino_id: to.id,
      server_url: from.server_url,
      instance_token: from.instance_token,
      numero_destino: destNum,
      numero_origem: origNum,
      dest_server_url: to.server_url,
      dest_instance_token: to.instance_token,
    };

    try {
      const iaRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ia-responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify(iaPayload),
      });
      const iaData = await iaRes.json().catch(() => ({}));
      enviados++;
      results.push({ from: from.nome, to: to.nome, status: "INICIADO", resposta: iaData });
    } catch (err) {
      results.push({ from: from.nome, to: to.nome, status: "ERRO", motivo: String(err) });
    }
  }

  return json({ success: true, enviados, pares: pairs.length, results });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
