import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { server_url, instance_token, instancia_id, telefone } = await req.json();

    if (!server_url || !instance_token || !instancia_id || !telefone) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios: server_url, instance_token, instancia_id, telefone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const telefoneNormalizado = String(telefone).trim().toLowerCase();
    if (telefoneNormalizado.includes("@g.us") || telefoneNormalizado.includes("status@broadcast")) {
      return new Response(
        JSON.stringify({ error: "Histórico de grupos e status está permanentemente bloqueado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanUrl = server_url.replace(/\/+$/, '');
    const chatId = `${telefone}@s.whatsapp.net`;

    // UAZAPI V2 endpoints for fetching chat messages
    const endpoints = [
      // /chat/find with query string auth
      {
        url: `${cleanUrl}/chat/find?token=${instance_token}`,
        method: "POST",
        body: { id: chatId, count: 50 },
        noHeader: true,
      },
      // /chat/find with header auth
      {
        url: `${cleanUrl}/chat/find`,
        method: "POST",
        body: { id: chatId, count: 50 },
        noHeader: false,
      },
      // /chat/details with number field + query string auth
      {
        url: `${cleanUrl}/chat/details?token=${instance_token}`,
        method: "POST",
        body: { number: telefone, count: 50 },
        noHeader: true,
      },
      // /chat/details with header auth
      {
        url: `${cleanUrl}/chat/details`,
        method: "POST",
        body: { number: telefone, count: 50 },
        noHeader: false,
      },
      // /chat/getMessages (legacy) 
      {
        url: `${cleanUrl}/chat/getMessages`,
        method: "POST",
        body: { id: chatId, count: 50 },
        noHeader: false,
      },
      // /chat/getMessages with query string
      {
        url: `${cleanUrl}/chat/getMessages?token=${instance_token}`,
        method: "POST",
        body: { id: chatId, count: 50 },
        noHeader: true,
      },
      // Try GET /chat/find with query params
      {
        url: `${cleanUrl}/chat/find?token=${instance_token}&id=${encodeURIComponent(chatId)}&count=50`,
        method: "GET",
        body: null,
        noHeader: true,
      },
    ];

    let messages: any[] | null = null;
    let lastError = "";
    let endpointUsed = "";
    let unsupportedCount = 0;
    let totalEndpoints = endpoints.length;

    for (const ep of endpoints) {
      try {
        console.log(`[fetch-history] Trying: ${ep.method} ${ep.url}`);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (!ep.noHeader) {
          headers["token"] = instance_token;
        }

        const fetchOptions: RequestInit = {
          method: ep.method,
          headers,
        };
        if (ep.body && ep.method !== "GET") {
          fetchOptions.body = JSON.stringify(ep.body);
        }

        const uazapiRes = await fetch(ep.url, fetchOptions);

        const text = await uazapiRes.text();
        console.log(`[fetch-history] Response from ${ep.url}: status=${uazapiRes.status}, length=${text.length}`);

        if (uazapiRes.ok) {
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = null; }

          // Extract messages array from various response formats
          const candidates = [
            parsed,
            parsed?.messages,
            parsed?.data,
            parsed?.result,
            parsed?.chat?.messages,
          ];
          
          // Also check if chats array contains messages
          if (parsed?.chats && Array.isArray(parsed.chats)) {
            for (const chat of parsed.chats) {
              if (chat.messages && Array.isArray(chat.messages)) {
                candidates.push(chat.messages);
              }
            }
          }
          
          for (const candidate of candidates) {
            if (Array.isArray(candidate) && candidate.length > 0) {
              // Verify it looks like messages (has key/message or body/content)
              const sample = candidate[0];
              const looksLikeMessages = sample.key || sample.message || sample.body || 
                                         sample.content || sample.messageTimestamp || sample.timestamp;
              if (looksLikeMessages) {
                messages = candidate;
                endpointUsed = ep.url;
                break;
              }
            }
          }
          
          if (messages) break;
          
          console.log(`[fetch-history] OK but no messages in response:`, JSON.stringify(parsed).substring(0, 300));
        } else if (uazapiRes.status === 404 || uazapiRes.status === 405) {
          unsupportedCount++;
          lastError = `${uazapiRes.status}: endpoint não suportado`;
        } else {
          lastError = `${uazapiRes.status}: ${text.substring(0, 200)}`;
          console.log(`[fetch-history] Failed: ${lastError}`);
        }
      } catch (e) {
        lastError = e.message;
        console.log(`[fetch-history] Error: ${e.message}`);
      }
    }

    // If all endpoints returned 404/405, the API doesn't support history
    if (!messages) {
      // If most endpoints returned 404/405, mark as unsupported
      const apiNotSupported = unsupportedCount >= totalEndpoints / 2;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          imported: 0, 
          api_supported: !apiNotSupported,
          debug: apiNotSupported 
            ? "Esta instância da API não suporta recuperação de histórico de mensagens" 
            : (lastError || "Nenhuma mensagem encontrada")
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fetch-history] Found ${messages.length} messages from ${endpointUsed}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing messages to deduplicate
    const { data: existingMsgs } = await supabase
      .from("whatsapp_mensagens")
      .select("timestamp_msg, conteudo, direcao")
      .eq("instancia_id", instancia_id)
      .eq("telefone_remoto", telefone);

    const existingKeys = new Set(
      (existingMsgs || []).map(
        (m: any) => `${m.timestamp_msg}|${m.direcao}|${m.conteudo?.substring(0, 100)}`
      )
    );

    const toInsert: any[] = [];

    for (const msg of messages) {
      const key = msg.key || {};
      const fromMe = key.fromMe === true;
      const direcao = fromMe ? "saida" : "entrada";

      const message = msg.message || {};
      let conteudo =
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.fileName ||
        msg.body ||
        msg.text ||
        msg.content ||
        "";

      let tipo_conteudo = "texto";
      let media_url: string | null = null;

      if (message.imageMessage) {
        tipo_conteudo = "imagem";
        if (!conteudo) conteudo = "📷 Imagem";
      } else if (message.videoMessage) {
        tipo_conteudo = "video";
        if (!conteudo) conteudo = "🎥 Vídeo";
      } else if (message.audioMessage || message.pttMessage) {
        tipo_conteudo = "audio";
        if (!conteudo) conteudo = "🎵 Áudio";
      } else if (message.documentMessage) {
        tipo_conteudo = "documento";
        if (!conteudo) conteudo = "📄 Documento";
      } else if (message.stickerMessage) {
        tipo_conteudo = "sticker";
        if (!conteudo) conteudo = "🏷️ Sticker";
      } else if (message.contactMessage || message.contactsArrayMessage) {
        tipo_conteudo = "texto";
        if (!conteudo) conteudo = "👤 Contato";
      } else if (message.locationMessage) {
        tipo_conteudo = "texto";
        if (!conteudo) conteudo = "📍 Localização";
      }

      // Try to get media URL if available
      const mediaMsg = message.imageMessage || message.audioMessage || message.pttMessage || 
                        message.videoMessage || message.documentMessage;
      if (mediaMsg) {
        media_url = mediaMsg.url || mediaMsg.directPath || mediaMsg.mediaUrl || null;
      }

      if (!conteudo) continue;

      let timestamp_msg: string;
      if (msg.messageTimestamp) {
        const ts = typeof msg.messageTimestamp === "number"
          ? msg.messageTimestamp
          : parseInt(msg.messageTimestamp, 10);
        timestamp_msg = new Date(ts * 1000).toISOString();
      } else if (msg.timestamp) {
        const ts = typeof msg.timestamp === "number"
          ? msg.timestamp
          : parseInt(msg.timestamp, 10);
        timestamp_msg = new Date(ts * 1000).toISOString();
      } else if (msg.date || msg.created_at) {
        timestamp_msg = new Date(msg.date || msg.created_at).toISOString();
      } else {
        continue;
      }

      const dedupeKey = `${timestamp_msg}|${direcao}|${conteudo.substring(0, 100)}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);

      toInsert.push({
        instancia_id: instancia_id,
        telefone_remoto: telefone,
        nome_contato: msg.pushName || msg.notifyName || null,
        conteudo,
        direcao,
        timestamp_msg,
        lida: true,
        tipo_conteudo,
        media_url,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const batch = toInsert.slice(i, i + 50);
        const { error } = await supabase.from("whatsapp_mensagens").insert(batch);
        if (error) {
          console.error("[fetch-history] Insert error:", error);
        } else {
          imported += batch.length;
        }
      }
    }

    console.log(`[fetch-history] Imported ${imported} messages for ${telefone}`);

    return new Response(
      JSON.stringify({ success: true, imported, api_supported: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fetch-history] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
