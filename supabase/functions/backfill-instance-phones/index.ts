// Backfill telefone das instâncias ativas + reaplica auto-arquivamento de
// conversas internas no inbox. Executar manualmente via botão admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function uazUrl(base: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

function parsePhone(data: any): string | null {
  const candidates = [
    data?.phoneNumber, data?.phone, data?.wid, data?.owner,
    data?.instance?.phone, data?.status?.phoneNumber, data?.status?.phone,
    data?.result?.phone, data?.data?.phone, data?.jid,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      const clean = c.replace(/\D/g, "");
      if (clean.length >= 8) return clean;
    }
  }
  return null;
}

async function fetchPhoneFromUazapi(serverUrl: string, token: string): Promise<string | null> {
  const base = serverUrl.replace(/\/+$/, "");
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";

  const attempts = [
    { url: uazUrl(base, "/instance/status", { token }), headers: {} as Record<string, string> },
    { url: `${base}/instance/status`, headers: { token } },
    { url: `${base}/instance/status`, headers: { token, admintoken: adminToken } },
  ];

  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { headers: a.headers });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data) continue;
      const p = parsePhone(data);
      if (p) return p;
    } catch (_) { /* try next */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Validate caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: userData } = await supabase.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: instances, error } = await supabase
      .from("user_whatsapp_instances")
      .select("id, server_url, instance_token, telefone")
      .eq("ativo", true);
    if (error) throw error;

    const total = instances?.length || 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const inst of instances || []) {
      if (inst.telefone && inst.telefone.replace(/\D/g, "").length >= 8) {
        skipped++;
        continue;
      }
      const phone = await fetchPhoneFromUazapi(inst.server_url, inst.instance_token);
      if (!phone) { failed++; continue; }
      const { error: upErr } = await supabase
        .from("user_whatsapp_instances")
        .update({ telefone: phone })
        .eq("id", inst.id);
      if (upErr) { failed++; continue; }
      updated++;
      // pequeno delay para não martelar a UAZAPI
      await new Promise((r) => setTimeout(r, 150));
    }

    // Backfill: arquiva contatos cujo telefone bate com outra instância da casa
    const { data: archivedRows, error: archErr } = await supabase.rpc(
      "exec_archive_internal_contacts" as any,
      {},
    ).then((r: any) => r).catch(() => ({ data: null, error: null }));

    // Fallback inline (caso o RPC não exista): roda update com SQL direto via PG não disponível aqui.
    // Em vez disso, executamos a equivalência usando 2 queries para limitar custo.
    let arquivados = 0;
    if (!archErr && !archivedRows) {
      const { data: contatos } = await supabase
        .from("whatsapp_contatos")
        .select("id, instancia_id, telefone, arquivado")
        .eq("arquivado", false);

      const { data: insts2 } = await supabase
        .from("user_whatsapp_instances")
        .select("id, telefone")
        .eq("ativo", true)
        .not("telefone", "is", null);

      const phoneSuffixToInst = new Map<string, Set<string>>();
      for (const i of insts2 || []) {
        if (!i.telefone) continue;
        const suf = i.telefone.replace(/\D/g, "").slice(-8);
        if (suf.length < 8) continue;
        if (!phoneSuffixToInst.has(suf)) phoneSuffixToInst.set(suf, new Set());
        phoneSuffixToInst.get(suf)!.add(i.id);
      }

      const idsToArchive: string[] = [];
      for (const c of contatos || []) {
        const suf = (c.telefone || "").replace(/\D/g, "").slice(-8);
        if (suf.length < 8) continue;
        const owners = phoneSuffixToInst.get(suf);
        if (!owners) continue;
        // arquiva se há outra instância (não a dona deste contato) com mesmo número
        const others = [...owners].filter((id) => id !== c.instancia_id);
        if (others.length > 0) idsToArchive.push(c.id);
      }

      // batch update em chunks de 500
      for (let i = 0; i < idsToArchive.length; i += 500) {
        const slice = idsToArchive.slice(i, i + 500);
        const { error: upE } = await supabase
          .from("whatsapp_contatos")
          .update({ arquivado: true })
          .in("id", slice);
        if (!upE) arquivados += slice.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true, total, updated, skipped, failed, arquivados,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
