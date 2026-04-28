import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getInstanceById(instanceId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("user_whatsapp_instances")
    .select("*")
    .eq("id", instanceId)
    .maybeSingle();
  if (error) throw new Error("DB error: " + error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, userId, instanceId, phone } = body;

    if (!userId) return json({ error: "userId is required" }, 400);

    if (action === "create-instance") return await createInstance(userId);
    if (action === "qr") return await fetchQr(instanceId || await getLatestInstanceId(userId), phone);
    if (action === "status") return await checkStatus(instanceId || await getLatestInstanceId(userId));
    if (action === "setup-webhook") return await setupWebhook(instanceId || await getLatestInstanceId(userId));
    if (action === "setup-webhook-all") return await setupWebhookAll();
    if (action === "disconnect") return await disconnectInstance(instanceId);

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: any, status = 200) {
  const safeStatus = Math.max(200, Math.min(599, status || 500));
  return new Response(JSON.stringify(data), {
    status: safeStatus,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uazUrl(base: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

async function getLatestInstanceId(userId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("user_whatsapp_instances")
    .select("id")
    .eq("user_id", userId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No instance found for user");
  return data.id;
}

// ── CREATE INSTANCE ──
async function createInstance(userId: string) {
  const baseUrl = Deno.env.get("UAZAPI_SERVER_URL") || Deno.env.get("UAZAPI_BASE_URL");
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN");
  if (!baseUrl || !adminToken) {
    return json({ ok: false, error: "UAZAPI_SERVER_URL or UAZAPI_ADMIN_TOKEN not configured" }, 500);
  }

  const instanceName = `user-${userId.slice(0, 8)}-${Date.now()}`;
  const base = baseUrl.replace(/\/+$/, "");

  console.log(`[CREATE] Creating instance ${instanceName}`);

  const res = await fetch(`${base}/instance/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json", admintoken: adminToken },
    body: JSON.stringify({ name: instanceName }),
  });

  const text = await res.text();
  console.log(`[CREATE] Response ${res.status}: ${text.substring(0, 500)}`);

  let data: any = null;
  try { data = JSON.parse(text); } catch (_) {}

  if (!res.ok) {
    return json({ ok: false, error: `UAZAPI returned ${res.status}`, detail: data || text }, res.status);
  }

  const token = data?.token || data?.instance?.token || data?.apitoken || null;
  const instanceUrl = data?.instance?.url || data?.url || base;

  if (!token) {
    return json({ ok: false, error: "Could not extract token from UAZAPI response", detail: data || text }, 500);
  }

  const sb = getSupabaseAdmin();
  const { data: inserted, error: dbError } = await sb
    .from("user_whatsapp_instances")
    .insert({
      user_id: userId,
      server_url: instanceUrl,
      instance_token: token,
      nome: instanceName,
      ativo: true,
    })
    .select()
    .single();

  if (dbError) {
    return json({ ok: false, error: "Failed to save instance: " + dbError.message }, 500);
  }

  // Fire-and-forget: já pré-configura o webhook na UAZAPI assim que a instância existe.
  // Quando o usuário escanear o QR e conectar, o webhook já estará ativo.
  reinforceWebhook(inserted.id).catch((e) =>
    console.log(`[CREATE] Webhook pre-config error (non-blocking): ${(e as Error).message}`)
  );

  return json({ ok: true, instanceId: inserted.id, instanceUrl, instanceToken: token });
}

// ── FETCH QR ──
async function fetchQr(instanceId: string, phone?: string) {
  const instance = await getInstanceById(instanceId);
  if (!instance) {
    return json({ ok: false, error: "No instance found. Create one first." }, 404);
  }
  const base = instance.server_url.replace(/\/+$/, "");
  const token = instance.instance_token;

  const debugLogs: string[] = [];

  // Normalize phone (digits only). If provided, request pairing code instead of QR.
  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
  const reqBody = cleanPhone ? JSON.stringify({ phone: cleanPhone }) : "{}";

  // Primary approach: POST /instance/connect with token header
  // Pairing-code flow is slower (UAZAPI opens session + generates code) → longer timeout + more retries
  const isPairing = !!cleanPhone;
  const maxAttempts = isPairing ? 5 : 3;
  const perAttemptTimeoutMs = isPairing ? 45000 : 25000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[QR] Attempt ${attempt}/${maxAttempts} POST ${base}/instance/connect${cleanPhone ? ` phone=${cleanPhone}` : ""} (timeout ${perAttemptTimeoutMs}ms)`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);

      const res = await fetch(`${base}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: reqBody,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const text = await res.text();
      console.log(`[QR] Response ${res.status}: ${text.substring(0, 500)}`);

      if (res.status === 401) {
        return json({
          ok: false,
          error: `Token inválido para a instância "${instance.nome || instanceId}". Esta instância pode ter sido removida do servidor. Tente criar uma nova conexão.`,
        }, 401);
      }

      // Retry on gateway timeout / bad gateway
      if ((res.status === 504 || res.status === 502 || res.status === 503) && attempt < maxAttempts) {
        debugLogs.push(`attempt ${attempt} TIMEOUT/GATEWAY: ${res.status}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }

      if (!res.ok) {
        debugLogs.push(`${res.status} PAYLOAD_ERR: ${text.substring(0, 150)}`);
        break;
      } else {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("image")) {
        const buf = new TextEncoder().encode(text);
        const base64 = btoa(String.fromCharCode(...buf));
        return json({ ok: true, qr: `data:${contentType};base64,${base64}`, pairingCode: null });
      }

      let data: any = null;
      try { data = JSON.parse(text); } catch (_) {}

      if (data) {
        const qr = data.qrcode || data.qr || data.base64 || data.qrCode ||
                   data.instance?.qrcode || data.instance?.qrcode_base64 || null;
        const pairingCode = data.pairingCode || data.pairing_code || data.paircode ||
                            data.instance?.paircode || data.instance?.pairingCode || null;

        // If pairing code requested, return it even without QR
        if (cleanPhone && pairingCode) {
          return json({ ok: true, qr: null, pairingCode });
        }

        if (qr) return json({ ok: true, qr, pairingCode });
        if (pairingCode) return json({ ok: true, qr: null, pairingCode });

        if (data.connected || data.status === "CONNECTED" || data.status === "open" ||
            data.instance?.status === "connected" || data.loggedIn) {
          const phone = data.phoneNumber || data.phone || data.wid || data.owner ||
                        data.instance?.phone || data.jid || null;
          return json({ ok: true, alreadyConnected: true, connected: true, phone });
        }

        debugLogs.push(`200 no QR: ${JSON.stringify(data).substring(0, 150)}`);
      }
    }
    break;
    } catch (e) {
      console.log(`[QR] Error attempt ${attempt}: ${(e as Error).message}`);
      const isTimeout = (e as Error).name === "AbortError" || (e as Error).message?.includes("timeout");
      debugLogs.push(`attempt ${attempt} ${isTimeout ? "TIMEOUT" : "ERROR"}: ${(e as Error).message}`);
      if (attempt < maxAttempts && isTimeout) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      break;
    }
  }

  // Fallback: if all attempts failed and we were in pairing mode, check status + try QR (no phone)
  if (isPairing) {
    try {
      console.log(`[QR] Fallback: checking status + retry connect without phone`);
      // Quick status check (best-effort, short timeout)
      try {
        const sCtrl = new AbortController();
        const sTimer = setTimeout(() => sCtrl.abort(), 8000);
        const sRes = await fetch(uazUrl(base, "/instance/status", { token }), { signal: sCtrl.signal })
          .finally(() => clearTimeout(sTimer));
        if (sRes.ok) {
          const sText = await sRes.text();
          let sData: any = null;
          try { sData = JSON.parse(sText); } catch (_) {}
          const parsed = sData ? parseConnectionState(sData) : null;
          if (parsed?.connected) {
            return json({ ok: true, alreadyConnected: true, connected: true, phone: parsed.phone });
          }
        }
      } catch (_) {}

      const fbCtrl = new AbortController();
      const fbTimer = setTimeout(() => fbCtrl.abort(), 25000);
      const fbRes = await fetch(`${base}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: "{}",
        signal: fbCtrl.signal,
      }).finally(() => clearTimeout(fbTimer));
      if (fbRes.ok) {
        const fbText = await fbRes.text();
        let fbData: any = null;
        try { fbData = JSON.parse(fbText); } catch (_) {}
        const qr = fbData?.qrcode || fbData?.qr || fbData?.base64 || fbData?.qrCode ||
                   fbData?.instance?.qrcode || fbData?.instance?.qrcode_base64 || null;
        if (qr) return json({ ok: true, qr, pairingCode: null, fallback: "qr-without-phone" });
      } else {
        debugLogs.push(`fallback ${fbRes.status}`);
      }
    } catch (e) {
      debugLogs.push(`fallback ERROR: ${(e as Error).message}`);
    }
  }

  return json({ ok: false, error: "Não foi possível obter o QR Code.", debug: debugLogs }, 400);
}

// ── CHECK STATUS ──
function parseConnectionState(data: any) {
  const statusCandidates = [
    data?.status, data?.state, data?.connectionStatus,
    data?.instance?.status, data?.instance?.state,
    data?.result?.status, data?.result?.state,
    data?.data?.status, data?.data?.state,
    data?.status?.status, data?.status?.state,
    data?.status?.connectionStatus, data?.status?.instance?.status,
  ];

  const rawStatusCandidate = statusCandidates.find((value) =>
    typeof value === "string" && value.trim().length > 0
  ) as string | undefined;

  const rawStatus = (rawStatusCandidate || "unknown").toLowerCase();
  const connectedByStatus = ["connected", "open", "online", "ready"].includes(rawStatus);
  const disconnectedByStatus = ["disconnected", "close", "closed", "offline", "logout", "not_connected"].includes(rawStatus);

  const connectedFlags = [
    data?.connected, data?.isConnected, data?.instance?.connected,
    data?.status?.connected, data?.status?.isConnected,
    data?.result?.connected, data?.data?.connected,
  ];

  const connectedByFlag = connectedFlags.includes(true);
  const disconnectedByFlag = connectedFlags.includes(false);

  const connected = connectedByFlag || connectedByStatus;
  const explicitDisconnected = !connected && (disconnectedByFlag || disconnectedByStatus);

  const phone = data?.phoneNumber || data?.phone || data?.wid ||
    data?.instance?.phone || data?.status?.phoneNumber || data?.status?.phone ||
    data?.result?.phone || data?.data?.phone || null;

  return { connected, explicitDisconnected, status: rawStatus, phone };
}

async function checkStatus(instanceId: string) {
  const instance = await getInstanceById(instanceId);
  if (!instance) {
    return json({ ok: false, connected: false, status: "no_instance" });
  }

  const base = instance.server_url.replace(/\/+$/, "");
  const token = instance.instance_token;
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";

  const attempts = [
    { url: uazUrl(base, "/instance/status", { token }), headers: {} },
    { url: `${base}/instance/status`, headers: { token } },
    { url: `${base}/instance/status`, headers: { token, admintoken: adminToken } },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { headers: attempt.headers });
      if (!res.ok) continue;

      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { continue; }

      const parsed = parseConnectionState(data);

      if (parsed.connected) {
        // Fire-and-forget: reinforce webhook config whenever instance is connected
        reinforceWebhook(instanceId).catch((e) => console.log(`[STATUS] Webhook reinforce error (non-blocking): ${(e as Error).message}`));
        // Fire-and-forget: tentar adicionar ao grupo de aquecimento
        triggerWarmingGroupAdd(instanceId).catch((e) => console.log(`[STATUS] Warming group add error (non-blocking): ${(e as Error).message}`));
        return json({ ok: true, connected: true, status: parsed.status, phone: parsed.phone });
      }

      if (parsed.explicitDisconnected) {
        return json({ ok: true, connected: false, status: parsed.status, phone: parsed.phone });
      }

      return json({ ok: true, connected: false, status: parsed.status || "unknown", phone: parsed.phone, stale: true });
    } catch (_) {}
  }

  return json({ ok: false, connected: false, status: "unknown", stale: true });
}

// ── SETUP WEBHOOK ──
async function setupWebhook(instanceId: string) {
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";
  const instance = await getInstanceById(instanceId);
  if (!instance) return json({ ok: false, error: "No instance found" }, 404);

  const base = instance.server_url.replace(/\/+$/, "");
  const token = instance.instance_token;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;
  // ⚠ COST CONTROL: exclude only groups & broadcasts. Keep payload minimal — extra
  // fields like 'excludeMessages' / 'addUrlEvents' break some UAZAPI server versions
  // and cause webhooks to silently stop delivering DMs.
  const payload = JSON.stringify({
    url: webhookUrl,
    events: ["messages"],
    excludeGroupMessages: true,
    excludeBroadcast: true,
  });

  const attempts = [
    { url: `${base}/webhook/${token}`, headers: { "Content-Type": "application/json" } },
    { url: `${base}/webhook`, headers: { "Content-Type": "application/json", token } },
    { url: `${base}/globalwebhook`, headers: { "Content-Type": "application/json", admintoken: adminToken } },
  ];

  const debugLogs: string[] = [];

  for (const attempt of attempts) {
    try {
      console.log(`[WEBHOOK] Trying POST ${attempt.url}`);
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: attempt.headers,
        body: payload,
      });

      const text = await res.text();
      console.log(`[WEBHOOK] ${attempt.url} => ${res.status}: ${text.substring(0, 300)}`);

      if (res.ok) {
        let data: any = null;
        try { data = JSON.parse(text); } catch (_) {}
        return json({ ok: true, webhookUrl, response: data || text });
      }

      debugLogs.push(`${res.status}: ${text.substring(0, 150)}`);
    } catch (err) {
      debugLogs.push(`ERROR: ${(err as Error).message}`);
    }
  }

  return json({ ok: false, error: "Não foi possível configurar o webhook.", debug: debugLogs }, 400);
}

// ── DISCONNECT INSTANCE ──
async function disconnectInstance(instanceId: string) {
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";
  const instance = await getInstanceById(instanceId);
  if (!instance) {
    return json({ ok: true, message: "No instance to disconnect" });
  }

  const base = instance.server_url.replace(/\/+$/, "");
  const token = instance.instance_token;

  // Try to logout (best-effort)
  try {
    const logoutAttempts = [
      { url: `${base}/instance/logout`, headers: { token, admintoken: adminToken } },
      { url: uazUrl(base, "/instance/logout", { token, admintoken: adminToken }), headers: {} },
    ];
    for (const attempt of logoutAttempts) {
      try {
        const res = await fetch(attempt.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...attempt.headers },
          body: "{}",
        });
        console.log(`[DISCONNECT] ${attempt.url} => ${res.status}`);
        if (res.ok) break;
      } catch (_) {}
    }
  } catch (e) {
    console.log(`[DISCONNECT] Logout error (non-blocking): ${(e as Error).message}`);
  }

  // Delete from DB
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("user_whatsapp_instances").delete().eq("id", instanceId);
  if (error) {
    return json({ ok: false, error: "Failed to delete instance: " + error.message }, 500);
  }

  return json({ ok: true, message: "WhatsApp desconectado com sucesso" });
}

// ── REINFORCE WEBHOOK (fire-and-forget helper, com retry + verify) ──
async function reinforceWebhook(instanceId: string) {
  const instance = await getInstanceById(instanceId);
  if (!instance) return;

  const base = instance.server_url.replace(/\/+$/, "");
  const token = instance.instance_token;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;

  // Payload: força enabled:true (UAZAPI cria desabilitado por padrão em algumas versões)
  // excludeGroupMessages + excludeBroadcast são os booleans que esta versão UAZAPI realmente respeita
  const payload = JSON.stringify({
    url: webhookUrl,
    events: ["messages"],
    enabled: true,
    excludeGroupMessages: true,
    excludeBroadcast: true,
  });

  const postAttempts = [
    { url: `${base}/webhook/${token}`, headers: { "Content-Type": "application/json" } },
    { url: `${base}/webhook`, headers: { "Content-Type": "application/json", token } },
  ];

  const backoffs = [1000, 3000, 6000];
  let configured = false;

  for (let attempt = 0; attempt < backoffs.length && !configured; attempt++) {
    for (const a of postAttempts) {
      try {
        const res = await fetch(a.url, { method: "POST", headers: a.headers, body: payload });
        if (res.ok) {
          configured = true;
          console.log(`[REINFORCE] POST OK ${a.url} (attempt ${attempt + 1}) for ${instance.nome || instanceId}`);
          break;
        }
      } catch (_) {}
    }
    if (!configured && attempt < backoffs.length - 1) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
  }

  if (!configured) {
    console.log(`[REINFORCE] POST failed after retries for ${instance.nome || instanceId}`);
    return;
  }

  // Verify: GET /webhook para confirmar URL + evento messages + enabled:true
  // Se vier desabilitado, faz 1 retry de POST para forçar ativação.
  const getAttempts = [
    { url: `${base}/webhook/${token}`, headers: {} as Record<string, string> },
    { url: `${base}/webhook`, headers: { token } },
  ];

  const verifyOnce = async (): Promise<{ verified: boolean; lastState?: any }> => {
    let lastState: any = null;
    for (const a of getAttempts) {
      try {
        const res = await fetch(a.url, { method: "GET", headers: a.headers });
        if (!res.ok) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { continue; }

        const items = Array.isArray(data) ? data : (data?.webhooks || data?.data || [data]);
        const match = items.find((it: any) => {
          const url = it?.url || it?.webhook || "";
          const events = it?.events || it?.event || [];
          const evList = Array.isArray(events) ? events : [events];
          return url === webhookUrl && evList.some((e: any) => String(e).toLowerCase().includes("message"));
        });

        if (match) {
          lastState = {
            enabled: match.enabled,
            events: match.events || match.event,
            excludeGroupMessages: match.excludeGroupMessages,
            excludeBroadcast: match.excludeBroadcast,
          };
          if (match.enabled === true) {
            return { verified: true, lastState };
          }
        }
      } catch (_) {}
    }
    return { verified: false, lastState };
  };

  let { verified, lastState } = await verifyOnce();

  // Se webhook existe mas está desabilitado, faz 1 retry de POST para ativar
  if (!verified && lastState && lastState.enabled === false) {
    console.log(`[REINFORCE] Webhook found but disabled for ${instance.nome || instanceId} — retrying POST to enable`);
    for (const a of postAttempts) {
      try {
        const res = await fetch(a.url, { method: "POST", headers: a.headers, body: payload });
        if (res.ok) break;
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 1500));
    ({ verified, lastState } = await verifyOnce());
  }

  if (verified) {
    console.log(`[REINFORCE] VERIFY OK (enabled:true) for ${instance.nome || instanceId}`);
    try {
      const sb = getSupabaseAdmin();
      await sb
        .from("user_whatsapp_instances")
        .update({ webhook_configurado_em: new Date().toISOString() })
        .eq("id", instanceId);
    } catch (e) {
      console.log(`[REINFORCE] DB update failed: ${(e as any).message}`);
    }
  } else {
    console.log(`[REINFORCE] VERIFY failed for ${instance.nome || instanceId} — state: ${JSON.stringify(lastState)}`);
  }
}

// ── SETUP WEBHOOK ALL ──
async function setupWebhookAll() {
  const sb = getSupabaseAdmin();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;

  const { data: instances, error } = await sb
    .from("user_whatsapp_instances")
    .select("*")
    .eq("ativo", true);

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!instances || instances.length === 0) return json({ ok: true, total: 0, success: 0, failed: 0, details: [] });

  const details: Array<{ id: string; nome: string; ok: boolean; error?: string }> = [];
  let successCount = 0;
  let failedCount = 0;

  for (const inst of instances) {
    const base = inst.server_url.replace(/\/+$/, "");
    const token = inst.instance_token;
    const payload = JSON.stringify({
      url: webhookUrl,
      events: ["messages"],
      enabled: true,
      excludeGroupMessages: true,
      excludeBroadcast: true,
    });

    const attempts = [
      { url: `${base}/webhook/${token}`, headers: { "Content-Type": "application/json" } },
      { url: `${base}/webhook`, headers: { "Content-Type": "application/json", token } },
      { url: `${base}/globalwebhook`, headers: { "Content-Type": "application/json", admintoken: adminToken } },
    ];

    let configured = false;
    let lastError = "";

    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, { method: "POST", headers: attempt.headers, body: payload });
        if (res.ok) {
          configured = true;
          break;
        }
        const text = await res.text();
        lastError = `${res.status}: ${text.substring(0, 100)}`;
      } catch (e) {
        lastError = (e as Error).message;
      }
    }

    if (configured) {
      successCount++;
      details.push({ id: inst.id, nome: inst.nome || inst.id, ok: true });
      console.log(`[WEBHOOK-ALL] ✅ ${inst.nome || inst.id}`);
    } else {
      failedCount++;
      details.push({ id: inst.id, nome: inst.nome || inst.id, ok: false, error: lastError });
      console.log(`[WEBHOOK-ALL] ❌ ${inst.nome || inst.id}: ${lastError}`);
    }
  }

  return json({ ok: true, total: instances.length, success: successCount, failed: failedCount, details });
}

// ── TRIGGER ADD TO WARMING GROUP (fire-and-forget) ──
async function triggerWarmingGroupAdd(instanceId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;
  await fetch(`${supabaseUrl}/functions/v1/add-to-warming-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ instancia_id: instanceId }),
  });
}
