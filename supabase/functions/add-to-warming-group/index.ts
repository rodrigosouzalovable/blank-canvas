import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const instanciaId: string | undefined = body.instancia_id;

    // Load active groups with auto_add_novas
    const { data: grupos } = await supabase
      .from("whatsapp_aquecimento_grupos")
      .select("*")
      .eq("ativo", true)
      .eq("auto_add_novas", true);

    if (!grupos || grupos.length === 0) {
      return json({ message: "Nenhum grupo ativo com auto-add" });
    }

    // Determine which instances to process
    let instancesToProcess: any[] = [];

    const MATURACAO_MS = 5 * 86400000;
    if (instanciaId) {
      const { data: inst } = await supabase
        .from("user_whatsapp_instances")
        .select("id, nome, ativo, criado_em")
        .eq("id", instanciaId)
        .eq("ativo", true)
        .maybeSingle();
      if (inst) instancesToProcess = [inst];
    } else {
      // Sweep mode: pegar instâncias ativas com 5+ dias de idade
      const { data: ativas } = await supabase
        .from("user_whatsapp_instances")
        .select("id, nome, criado_em")
        .eq("ativo", true);
      instancesToProcess = (ativas || []).filter((i: any) => {
        const idade = Date.now() - new Date(i.criado_em).getTime();
        return idade >= MATURACAO_MS;
      });
    }

    const results: any[] = [];
    let addedThisCall = 0;
    const MAX_PER_CALL = instanciaId ? 99 : 1; // sweep faz só 1 por ciclo

    for (const grupo of grupos) {
      // Get admin instance details
      const { data: adminInst } = await supabase
        .from("user_whatsapp_instances")
        .select("id, nome, server_url, instance_token, ativo")
        .eq("id", grupo.instancia_admin_id)
        .maybeSingle();

      if (!adminInst || !adminInst.ativo) {
        results.push({ grupo: grupo.nome, skipped: "admin desativado" });
        continue;
      }

      // Daily cap: 3 adds/dia pela instância admin
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: addsHoje } = await supabase
        .from("whatsapp_aquecimento_grupo_membros")
        .select("*", { count: "exact", head: true })
        .eq("grupo_id", grupo.id)
        .eq("status", "ok")
        .gte("adicionado_em", todayStart.toISOString());

      if ((addsHoje || 0) >= 3 && !instanciaId) {
        results.push({ grupo: grupo.nome, skipped: "limite diário (3) atingido" });
        continue;
      }

      // Horário 7h-21h BRT
      const hourBR = parseInt(
        new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })
      );
      const dowBR = new Date().toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
      if (!instanciaId && (hourBR < 7 || hourBR >= 21 || dowBR === "Sun")) {
        results.push({ grupo: grupo.nome, skipped: "fora de horário" });
        continue;
      }

      for (const inst of instancesToProcess) {
        if (addedThisCall >= MAX_PER_CALL) break;
        if (inst.id === grupo.instancia_admin_id) continue;

        // Já é membro?
        const { data: existing } = await supabase
          .from("whatsapp_aquecimento_grupo_membros")
          .select("id, status, tentativas")
          .eq("grupo_id", grupo.id)
          .eq("instancia_id", inst.id)
          .maybeSingle();

        if (existing && ["ok", "removido_manualmente"].includes(existing.status)) continue;
        if (existing && existing.tentativas >= 5) continue;

        // Extrai telefone do nome da instância
        const phone = inst.nome?.match(/^\d+/)?.[0];
        if (!phone) {
          await upsertMember(supabase, grupo.id, inst.id, existing?.id, "erro", { erro_mensagem: "Sem telefone no nome" });
          continue;
        }
        const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;

        // Chamada UAZAPI
        try {
          const url = `${adminInst.server_url.replace(/\/$/, "")}/group/updateParticipants`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: adminInst.instance_token,
            },
            body: JSON.stringify({
              groupjid: grupo.group_jid,
              action: "add",
              participants: [fullPhone],
            }),
          });
          const text = await res.text();
          let parsed: any = {};
          try { parsed = JSON.parse(text); } catch {}

          const lower = text.toLowerCase();

          if (res.ok && !lower.includes("error") && !lower.includes("not admin")) {
            // Verifica se UAZAPI retornou invite link (privacy)
            const inviteMatch = text.match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/);
            if (inviteMatch) {
              await upsertMember(supabase, grupo.id, inst.id, existing?.id, "convite_necessario", {
                invite_link: inviteMatch[0],
                erro_mensagem: "Privacidade exige convite manual",
              });
              results.push({ instancia: inst.nome, grupo: grupo.nome, status: "convite_necessario" });
            } else {
              await upsertMember(supabase, grupo.id, inst.id, existing?.id, "ok", {
                adicionado_em: new Date().toISOString(),
              });
              results.push({ instancia: inst.nome, grupo: grupo.nome, status: "ok" });
              addedThisCall++;
            }
          } else if (lower.includes("not admin") || lower.includes("not_admin")) {
            await supabase.from("whatsapp_aquecimento_grupos")
              .update({ ativo: false, ultimo_erro: "Instância admin não é mais admin do grupo" })
              .eq("id", grupo.id);
            await upsertMember(supabase, grupo.id, inst.id, existing?.id, "erro", { erro_mensagem: "Admin não é admin do grupo" });
            results.push({ grupo: grupo.nome, status: "grupo_inválido" });
            break;
          } else if (lower.includes("disconnected") || lower.includes("not connected")) {
            results.push({ instancia: inst.nome, status: "admin_desconectado", skipped: true });
            break;
          } else {
            await upsertMember(supabase, grupo.id, inst.id, existing?.id, "erro", {
              erro_mensagem: text.substring(0, 300),
            });
            results.push({ instancia: inst.nome, grupo: grupo.nome, status: "erro", detail: text.substring(0, 100) });
          }

          // Anti-ban delay 30-120s entre adds (só se for sweep com mais de 1)
          if (instancesToProcess.length > 1 && addedThisCall > 0) {
            await new Promise(r => setTimeout(r, 30000 + Math.random() * 90000));
          }
        } catch (e) {
          await upsertMember(supabase, grupo.id, inst.id, existing?.id, "erro", {
            erro_mensagem: String(e).substring(0, 300),
          });
          results.push({ instancia: inst.nome, status: "exception", error: String(e) });
        }
      }
    }

    return json({ success: true, results, added: addedThisCall });
  } catch (err) {
    console.error("[ADD-WARMING-GROUP]", err);
    return json({ error: String(err) }, 500);
  }
});

async function upsertMember(
  supabase: any,
  grupo_id: string,
  instancia_id: string,
  existingId: string | undefined,
  status: string,
  extra: Record<string, any>
) {
  if (existingId) {
    const { data: cur } = await supabase
      .from("whatsapp_aquecimento_grupo_membros")
      .select("tentativas")
      .eq("id", existingId)
      .maybeSingle();
    await supabase.from("whatsapp_aquecimento_grupo_membros").update({
      status,
      ultima_tentativa_em: new Date().toISOString(),
      tentativas: (cur?.tentativas || 0) + 1,
      ...extra,
    }).eq("id", existingId);
  } else {
    await supabase.from("whatsapp_aquecimento_grupo_membros").insert({
      grupo_id,
      instancia_id,
      status,
      ultima_tentativa_em: new Date().toISOString(),
      tentativas: 1,
      ...extra,
    });
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
