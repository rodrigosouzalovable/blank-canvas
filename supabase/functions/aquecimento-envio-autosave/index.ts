// Aquecimento Externo Auto-Save - sem IA, custo zero por envio
// Prioriza envios para números âncora (70%) + pool de contatos externos (30%)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";
import { salvarContatoAgendaCacheado } from "../_shared/agenda-contatos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Números âncora (destinos prioritários — sempre online, respondem manualmente)
// Formato: 55 + DDD + número
const ANCORAS_PRIORITARIAS = [
  "5562991672674",
  "5562981810202",
  "5562981079590",
  "5562981865213",
  "5562982183144",
  "5562982458447",
  "5562981079569",
];

const ANCORA_PROBABILITY = 0.7; // 70% âncoras, 30% pool externa

const MENSAGENS = [
  // Originais (30)
  "Oi", "Olá", "Bom dia", "Boa tarde", "Boa noite",
  "E aí", "Salve", "Tudo bem?", "Tudo certo?", "Tudo bom?",
  "Como vai?", "Beleza?", "Oi, tudo bem?", "Olá, tudo bem?",
  "Bom dia!", "Boa tarde!", "Oii", "E aí, beleza?",
  "Tudo joia?", "Tudo tranquilo?", "Como está?", "Oie",
  "Eai", "Opa", "Opa, tudo bem?", "Salve salve",
  "Tudo na paz?", "E aí, tudo certo?", "Boa!", "Olá!",
  // Novas (20+) — variações naturais com emojis discretos
  "Hey, tudo joia? 👋", "Coe, firmeza?", "Bão?",
  "Fala chefe", "E aí, tranquilo?", "Suave?",
  "Oi, quanto tempo!", "Lembrou de mim?", "Passando pra dar um oi 👋",
  "Só passando pra dizer oi", "Tudo na paz?", "Firme e forte?",
  "E aí, novidades?", "Como andam as coisas?", "Tudo em cima? 👍",
  "Salve, camarada", "Opa, belezinha?", "Fala parceiro",
  "Oi, espero que esteja bem 🙂", "Só um oi rápido",
];

function pickMsg(): string {
  return MENSAGENS[Math.floor(Math.random() * MENSAGENS.length)];
}

function limiteDiarioPorFase(fase: number): number {
  if (fase <= 2) return 3;
  if (fase <= 4) return 5;
  return 7;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Horário comercial (07-21h BRT) e pausa de almoço (12-14h BRT)
    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = sp.getHours();
    const dow = sp.getDay();
    if (hour < 7 || hour >= 21) {
      return json({ message: "Fora do horário", skipped: true });
    }
    if (hour >= 12 && hour < 14) {
      return json({ message: "Pausa de almoço", skipped: true });
    }
    // Fator fim de semana: domingo 40%, sábado 60%, demais 100%
    const fatorDia = dow === 0 ? 0.4 : dow === 6 ? 0.6 : 1.0;

    // Instâncias em aquecimento
    const { data: aquecInsts } = await supabase
      .from("whatsapp_aquecimento_instancias")
      .select("id, instancia_id, fase, status")
      .in("status", ["EM_AQUECIMENTO", "AQUECIDO"]);

    if (!aquecInsts?.length) return json({ message: "Sem instâncias ativas", skipped: true });

    const ids = aquecInsts.map((i: any) => i.instancia_id);
    const { data: insts } = await supabase
      .from("user_whatsapp_instances")
      .select("id, nome, server_url, instance_token, ativo")
      .in("id", ids)
      .eq("ativo", true);

    const instMap = new Map((insts || []).map((i: any) => [i.id, i]));
    const inicioDia = new Date(sp); inicioDia.setHours(0, 0, 0, 0);
    const inicioDiaIso = inicioDia.toISOString();
    const corte30dIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const corte7dIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // Processa todas as instâncias EM PARALELO (cada uma é independente)
    const tasks = aquecInsts.map(async (aquec: any) => {
      const inst = instMap.get(aquec.instancia_id);
      if (!inst) return { status: "sem_instancia" };

      // Aplica fator fim-de-semana (mín 1) ao limite da fase
      const limiteBase = limiteDiarioPorFase(aquec.fase || 1);
      const limite = Math.max(1, Math.floor(limiteBase * fatorDia));

      const { count: enviosHoje } = await supabase
        .from("aquecimento_envios_autosave")
        .select("id", { count: "exact", head: true })
        .eq("instancia_id", aquec.instancia_id)
        .gte("enviado_em", inicioDiaIso);

      if ((enviosHoje || 0) >= limite) {
        return { instancia: inst.nome, status: "limite_atingido", enviosHoje };
      }

      // === Seleciona destino: 70% âncora, 30% pool externa ===
      const useAncora = Math.random() < ANCORA_PROBABILITY;
      let numeroFinal: string | null = null;
      let contatoId: string | null = null;
      let nomeContato: string | null = null;
      let origem: "ancora" | "pool" = "ancora";

      if (useAncora) {
        // Rodízio justo entre âncoras: pega a que esta instância MENOS usou nos últimos 7 dias
        const { data: usosAncora } = await supabase
          .from("aquecimento_envios_autosave")
          .select("numero_destino")
          .eq("instancia_id", aquec.instancia_id)
          .gte("enviado_em", corte7dIso)
          .in("numero_destino", ANCORAS_PRIORITARIAS);

        const counts = new Map<string, number>();
        ANCORAS_PRIORITARIAS.forEach((n) => counts.set(n, 0));
        (usosAncora || []).forEach((r: any) => {
          if (r.numero_destino) counts.set(r.numero_destino, (counts.get(r.numero_destino) || 0) + 1);
        });
        // Ordena por menor uso e desempate aleatório
        const ordenados = [...counts.entries()].sort((a, b) => a[1] - b[1] || Math.random() - 0.5);
        numeroFinal = ordenados[0][0];
        nomeContato = `Âncora ${numeroFinal.slice(-4)}`;
        origem = "ancora";
      } else {
        // Pool externa — lógica original (rotaciona por menor uso e exclui últimos 30 dias)
        const { data: usadosRecentes } = await supabase
          .from("aquecimento_envios_autosave")
          .select("contato_id")
          .eq("instancia_id", aquec.instancia_id)
          .gte("enviado_em", corte30dIso)
          .not("contato_id", "is", null);

        const excluir = new Set((usadosRecentes || []).map((u: any) => u.contato_id));

        const { data: candidatos } = await supabase
          .from("aquecimento_contatos_autosave")
          .select("id, numero, nome, total_usos")
          .eq("ativo", true)
          .order("ultimo_uso_em", { ascending: true, nullsFirst: true })
          .limit(50);

        const contato = (candidatos || []).find((c: any) => !excluir.has(c.id));
        if (!contato) {
          // Fallback: se a pool acabou, manda pra âncora
          const ancora = ANCORAS_PRIORITARIAS[Math.floor(Math.random() * ANCORAS_PRIORITARIAS.length)];
          numeroFinal = ancora;
          nomeContato = `Âncora ${ancora.slice(-4)}`;
          origem = "ancora";
        } else {
          const numeroLimpo = String(contato.numero).replace(/\D/g, "");
          numeroFinal = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;
          contatoId = contato.id;
          nomeContato = contato.nome || `Contato ${numeroFinal}`;
          origem = "pool";
        }
      }

      if (!numeroFinal) {
        return { instancia: inst.nome, status: "sem_destino" };
      }

      const mensagem = pickMsg();

      try {
        // PRE-SAVE: salva contato na agenda física antes de enviar (cacheado)
        try {
          await salvarContatoAgendaCacheado(
            supabase,
            aquec.instancia_id,
            inst.server_url,
            inst.instance_token,
            numeroFinal,
            nomeContato || `Contato ${numeroFinal}`,
          );
        } catch (_) { /* não bloqueia envio se falhar */ }

        // Timeout de 20s por envio para evitar travamento
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);

        const sendRes = await fetch(`${inst.server_url}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: inst.instance_token },
          body: JSON.stringify({ number: numeroFinal, text: mensagem }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        const respText = await sendRes.text();

        if (sendRes.ok) {
          await supabase.from("aquecimento_envios_autosave").insert({
            instancia_id: aquec.instancia_id,
            contato_id: contatoId,
            numero_destino: numeroFinal,
            mensagem_enviada: mensagem,
          });

          if (contatoId) {
            const { data: c } = await supabase
              .from("aquecimento_contatos_autosave")
              .select("total_usos")
              .eq("id", contatoId)
              .maybeSingle();
            await supabase
              .from("aquecimento_contatos_autosave")
              .update({
                ultimo_uso_em: new Date().toISOString(),
                respondeu_ultima: false,
                total_usos: ((c as any)?.total_usos || 0) + 1,
              })
              .eq("id", contatoId);
          }

          return { instancia: inst.nome, destino: numeroFinal, origem, status: "enviado", msg: mensagem };
        } else {
          return { instancia: inst.nome, destino: numeroFinal, origem, status: "erro", detalhe: respText.substring(0, 150) };
        }
      } catch (e) {
        return { instancia: inst.nome, status: "exception", erro: String(e).substring(0, 150) };
      }
    });

    const resultados = await Promise.all(tasks);
    const enviados = resultados.filter((r: any) => r.status === "enviado").length;
    const enviadosAncora = resultados.filter((r: any) => r.status === "enviado" && r.origem === "ancora").length;
    const enviadosPool = resultados.filter((r: any) => r.status === "enviado" && r.origem === "pool").length;

    return json({
      success: true,
      enviados,
      enviadosAncora,
      enviadosPool,
      total_instancias: aquecInsts.length,
      resultados,
    });
  } catch (err) {
    console.error("[AUTOSAVE]", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
