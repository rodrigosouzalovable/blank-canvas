import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Probabilidade de responder por fase (skip silencioso simulando humano ocupado)
const PROB_RESPOSTA_POR_FASE: Record<number, number> = { 1: 0.6, 2: 0.8 };
const FALLBACK_FINAL = "Ah legal!";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ========== AUDITORIA: nunca quebra o fluxo ==========
async function auditar(row: {
  instancia_origem_id?: string | null;
  instancia_destino_id?: string | null;
  numero_origem?: string | null;
  numero_destino?: string | null;
  etapa: 'webhook_in' | 'ollama_call' | 'uazapi_send' | 'cascade_skip';
  status: 'ok' | 'falhou' | 'timeout' | 'ignorado';
  mensagem_original?: string | null;
  resposta_gerada?: string | null;
  motivo?: string | null;
  http_status?: number | null;
  tempo_resposta_ms?: number | null;
}) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('whatsapp_conversas_auditoria').insert({
      ...row,
      mensagem_original: row.mensagem_original?.substring(0, 500) ?? null,
      resposta_gerada: row.resposta_gerada?.substring(0, 500) ?? null,
      motivo: row.motivo?.substring(0, 300) ?? null,
    });
  } catch (_e) { /* silencioso */ }
}

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

// Humanized delay distribution simulating real human response patterns
function humanizedDelay(): number {
  const roll = Math.random();
  if (roll < 0.30) {
    // 30%: fast reply (5-15s) — had phone in hand
    return randomDelay(5000, 15000);
  } else if (roll < 0.70) {
    // 40%: normal reply (30-90s) — read and replied
    return randomDelay(30000, 90000);
  } else if (roll < 0.90) {
    // 20%: slow reply (2-5 min) — was busy
    return randomDelay(120000, 300000);
  } else {
    // 10%: very slow (5-10 min) — went to do something else
    return randomDelay(300000, 600000);
  }
}

// Send "typing..." indicator before message for natural feel
async function enviarTypingIndicator(serverUrl: string, instanceToken: string, numero: string, textoLength: number): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  // Duration proportional to message length: 1-4 seconds
  const typingDuration = Math.min(1000 + textoLength * 30, 4000);
  
  try {
    // Start composing
    await fetch(`${cleanUrl}/send/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: numero, state: "composing" }),
    }).catch(() => {});
    
    // Wait for typing duration
    await new Promise(r => setTimeout(r, typingDuration));
    
    // Stop composing
    await fetch(`${cleanUrl}/send/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: numero, state: "paused" }),
    }).catch(() => {});
  } catch (e) {
    console.warn("[IA] Typing indicator error (non-critical):", e);
  }
}

// ========== MOTOR DE DIÁLOGO POR POOL (sem IA externa) ==========

type DialogoRow = { id: string; resposta: string; peso: number; gatilho?: string[] | null };

function normalizarTexto(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function tokensDe(t: string): string[] {
  return normalizarTexto(t).split(/\s+/).filter(w => w.length >= 2);
}

function sorteioPonderado<T extends { peso: number }>(itens: T[]): T {
  if (itens.length === 1) return itens[0];
  const total = itens.reduce((s, i) => s + Math.max(1, i.peso || 1), 0);
  let r = Math.random() * total;
  for (const it of itens) {
    r -= Math.max(1, it.peso || 1);
    if (r <= 0) return it;
  }
  return itens[itens.length - 1];
}

async function filtrarSemRepetir<T extends { id: string }>(sb: any, candidatos: T[], numeroDestino: string): Promise<T[]> {
  if (!candidatos.length || !numeroDestino) return candidatos;
  try {
    const dest = numeroDestino.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    const desde = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: usos } = await sb
      .from("whatsapp_dialogos_uso")
      .select("dialogo_id")
      .eq("numero_destino", dest)
      .gte("usado_em", desde);
    const usados = new Set((usos || []).map((u: any) => u.dialogo_id));
    const filtrados = candidatos.filter(c => !usados.has(c.id));
    return filtrados.length ? filtrados : candidatos;
  } catch { return candidatos; }
}

async function registrarUso(sb: any, dialogo: DialogoRow, numeroDestino: string): Promise<string> {
  try {
    const dest = (numeroDestino || "").replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    if (dest) await sb.from("whatsapp_dialogos_uso").insert({ dialogo_id: dialogo.id, numero_destino: dest });
  } catch { /* silencioso */ }
  // Incremento best-effort do contador (read-modify-write — race aceitável)
  try {
    const { data: cur } = await sb.from("whatsapp_dialogos_pool").select("vezes_utilizada").eq("id", dialogo.id).single();
    await sb.from("whatsapp_dialogos_pool").update({ vezes_utilizada: (cur?.vezes_utilizada || 0) + 1 }).eq("id", dialogo.id);
  } catch { /* silencioso */ }
  return dialogo.resposta;
}

async function gerarMensagemInicial(faseOrigem: number = 1): Promise<string> {
  const sb = getSupabaseAdmin();
  try {
    const { data } = await sb
      .from("whatsapp_dialogos_pool")
      .select("id,resposta,peso")
      .eq("contexto", "inicial").eq("ativo", true)
      .lte("fase_minima", Math.max(1, faseOrigem));
    if (!data?.length) return "Oi! Tudo bem?";
    const escolhido = sorteioPonderado(data as DialogoRow[]);
    console.log(`[IA-Pool] Inicial fase=${faseOrigem}: "${escolhido.resposta}"`);
    return escolhido.resposta;
  } catch (e) {
    console.warn("[IA-Pool] Erro inicial:", e);
    return "Oi! Tudo bem?";
  }
}

async function chamarIA(
  mensagem: string,
  _historico: string,
  totalTrocas: number,
  maxTrocas: number,
  auditCtx?: { instancia_origem_id?: string; instancia_destino_id?: string; numero_destino?: string },
  faseOrigem: number = 1,
): Promise<string> {
  const sb = getSupabaseAdmin();
  const t0 = Date.now();
  const numeroDestino = auditCtx?.numero_destino || "";
  const fase = Math.max(1, faseOrigem);

  // 1) Encerramento progressivo (última troca)
  const ehEncerramento = totalTrocas >= (maxTrocas - 1);
  if (ehEncerramento) {
    const { data } = await sb
      .from("whatsapp_dialogos_pool")
      .select("id,resposta,peso")
      .eq("contexto", "encerramento").eq("ativo", true)
      .lte("fase_minima", fase);
    if (data?.length) {
      const filt = await filtrarSemRepetir(sb, data as DialogoRow[], numeroDestino);
      const escolhido = sorteioPonderado(filt);
      const resp = await registrarUso(sb, escolhido, numeroDestino);
      const ms = Date.now() - t0;
      console.log(`[IA-Pool] Encerramento (${totalTrocas + 1}/${maxTrocas}): "${resp}"`);
      auditar({ etapa: 'ollama_call', status: 'ok', tempo_resposta_ms: ms, resposta_gerada: resp, motivo: 'pool:encerramento', mensagem_original: mensagem, ...(auditCtx || {}) });
      return resp;
    }
  }

  // 2) Match por gatilho (palavras-chave)
  const tokens = tokensDe(mensagem);
  let respostaPool: DialogoRow | null = null;
  let origemMatch = "coringa";

  if (tokens.length) {
    const { data: respostas } = await sb
      .from("whatsapp_dialogos_pool")
      .select("id,resposta,peso,gatilho")
      .eq("contexto", "resposta").eq("ativo", true)
      .lte("fase_minima", fase)
      .overlaps("gatilho", tokens);
    if (respostas?.length) {
      const filt = await filtrarSemRepetir(sb, respostas as DialogoRow[], numeroDestino);
      respostaPool = sorteioPonderado(filt);
      origemMatch = "resposta";
    }
  }

  // 3) Fallback: coringa
  if (!respostaPool) {
    const { data: coringas } = await sb
      .from("whatsapp_dialogos_pool")
      .select("id,resposta,peso")
      .eq("contexto", "coringa").eq("ativo", true)
      .lte("fase_minima", fase);
    if (coringas?.length) {
      const filt = await filtrarSemRepetir(sb, coringas as DialogoRow[], numeroDestino);
      respostaPool = sorteioPonderado(filt);
      origemMatch = "coringa";
    }
  }

  if (!respostaPool) {
    auditar({ etapa: 'cascade_skip', status: 'ignorado', motivo: 'pool_vazio', mensagem_original: mensagem, ...(auditCtx || {}) });
    return FALLBACK_FINAL;
  }

  const resp = await registrarUso(sb, respostaPool, numeroDestino);
  const ms = Date.now() - t0;
  console.log(`[IA-Pool] Resposta ${origemMatch} fase=${fase} (${totalTrocas + 1}/${maxTrocas}): "${resp}"`);
  auditar({ etapa: 'ollama_call', status: 'ok', tempo_resposta_ms: ms, resposta_gerada: resp, motivo: `pool:${origemMatch}`, mensagem_original: mensagem, ...(auditCtx || {}) });
  return resp;
}

// Helper: probabilidade de ignorar resposta (humano "ocupado")
function deveResponderPorFase(fase: number): boolean {
  const prob = PROB_RESPOSTA_POR_FASE[fase] ?? 0.95;
  return Math.random() <= prob;
}


async function salvarContatoUAZAPI(serverUrl: string, instanceToken: string, numero: string, nome: string): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  const cleanNumber = numero.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
  console.log(`[IA] 📋 Tentando salvar contato na agenda: numero=${cleanNumber}, nome="${nome}", server=${cleanUrl}`);
  
  const payloads = [
    { number: cleanNumber, name: nome },
    { number: `${cleanNumber}@s.whatsapp.net`, name: nome },
    { phone: cleanNumber, name: nome, displayName: nome },
  ];
  const endpoints = [
    `${cleanUrl}/contact/add`,
    `${cleanUrl}/contacts/add`,
    `${cleanUrl}/contact/upsert`,
    `${cleanUrl}/contacts/upsert`,
  ];

  for (const url of endpoints) {
    for (const payload of payloads) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: instanceToken },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        console.log(`[IA] 📱 ${url} payload=${JSON.stringify(payload)} → status=${res.status} body=${text.substring(0, 200)}`);
        if (res.ok) {
          console.log(`[IA] ✅ Contato salvo na agenda: ${cleanNumber} como "${nome}" via ${url}`);
          return true;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[IA] Endpoint contato ${url} falhou: ${msg}`);
      }
    }
  }
  console.warn(`[IA] ⚠️ Não foi possível salvar contato ${cleanNumber} na agenda (todos endpoints falharam)`);
  return false;
}

async function enviarMensagemUAZAPI(serverUrl: string, instanceToken: string, numero: string, texto: string, auditCtx?: { instancia_origem_id?: string; instancia_destino_id?: string }): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  const endpoints = [`${cleanUrl}/send/text`, `${cleanUrl}/message/sendText`, `${cleanUrl}/sendText`];
  let lastStatus: number | null = null;
  let lastBody: string = '';

  for (const url of endpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instanceToken },
        body: JSON.stringify({ number: numero, text: texto }),
      });
      const ms = Date.now() - t0;
      lastStatus = res.status;
      const body = await res.text();
      lastBody = body.substring(0, 200);
      if (res.ok) {
        console.log(`[IA] ✅ Enviada via ${url} ms=${ms} status=${res.status} → ${numero}: "${texto}"`);
        auditar({ etapa: 'uazapi_send', status: 'ok', http_status: res.status, tempo_resposta_ms: ms, numero_destino: numero, resposta_gerada: texto, motivo: url, ...(auditCtx || {}) });
        return true;
      }
      console.warn(`[IA] Endpoint ${url} status=${res.status} ms=${ms} body=${lastBody}`);
    } catch (e) {
      const ms = Date.now() - t0;
      lastBody = String(e).substring(0, 200);
      console.warn(`[IA] Endpoint ${url} ms=${ms} falhou:`, e);
      auditar({ etapa: 'uazapi_send', status: 'falhou', tempo_resposta_ms: ms, numero_destino: numero, motivo: `${url}: ${lastBody}`, ...(auditCtx || {}) });
    }
  }
  console.error(`[IA] ❌ Falha ao enviar para ${numero} (último status=${lastStatus})`);
  auditar({ etapa: 'uazapi_send', status: 'falhou', http_status: lastStatus, numero_destino: numero, resposta_gerada: texto, motivo: `all endpoints failed: ${lastBody}`, ...(auditCtx || {}) });
  return false;
}

// ========== MEDIA HELPERS (Audio + Image) ==========

async function listarMidiaAquecimento(sb: any, pasta: string): Promise<string[]> {
  try {
    const { data: files, error } = await sb.storage
      .from("campaign-audio")
      .list(pasta, { limit: 100 });
    if (error || !files) {
      console.warn(`[IA] Erro listando mídia em ${pasta}:`, error);
      return [];
    }
    return files
      .filter((f: any) => f.name && !f.name.startsWith("."))
      .map((f: any) => f.name);
  } catch (e) {
    console.warn(`[IA] Erro listando mídia ${pasta}:`, e);
    return [];
  }
}

function getPublicUrl(sb: any, bucket: string, path: string): string {
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || "";
}

async function enviarAudioUAZAPI(serverUrl: string, instanceToken: string, numero: string, audioUrl: string): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${cleanUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: numero, type: "ptt", file: audioUrl }),
    });
    const text = await res.text();
    console.log(`[IA] 🎙️ Áudio enviado para ${numero}: status=${res.status} body=${text.substring(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.error(`[IA] ❌ Erro envio áudio:`, e);
    return false;
  }
}

async function enviarImagemUAZAPI(serverUrl: string, instanceToken: string, numero: string, imageUrl: string, caption?: string): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, "");
  try {
    const body: any = { number: numero, type: "image", file: imageUrl };
    if (caption) body.caption = caption;
    const res = await fetch(`${cleanUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`[IA] 🖼️ Imagem enviada para ${numero}: status=${res.status} body=${text.substring(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.error(`[IA] ❌ Erro envio imagem:`, e);
    return false;
  }
}

async function logToInbox(sb: any, instanciaId: string, telefoneRemoto: string, texto: string, direcao: "saida" | "entrada" = "saida", tipoConteudo: string = "texto", mediaUrl?: string) {
  try {
    const cleanPhone = telefoneRemoto.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    const phoneSuffix = cleanPhone.replace(/^55/, "").slice(-8);

    const { data: contato } = await sb
      .from("whatsapp_contatos")
      .select("id, telefone")
      .eq("instancia_id", instanciaId)
      .or(`telefone.eq.${cleanPhone},telefone.ilike.%${phoneSuffix}`)
      .maybeSingle();

    let phoneToStore = contato?.telefone || cleanPhone;

    if (!contato) {
      const { data: newContato } = await sb.from("whatsapp_contatos").insert({
        instancia_id: instanciaId,
        telefone: cleanPhone,
        nome: cleanPhone,
        ultima_mensagem: texto.slice(0, 200),
        ultima_mensagem_em: new Date().toISOString(),
      }).select("id, telefone").single();

      if (newContato) {
        phoneToStore = newContato.telefone;
        console.log(`[IA] 📇 Contato criado: ${cleanPhone} para instância ${instanciaId}`);
      }
    } else {
      await sb.from("whatsapp_contatos").update({
        ultima_mensagem: texto.slice(0, 200),
        ultima_mensagem_em: new Date().toISOString(),
      }).eq("id", contato.id);
    }

    const insertData: any = {
      instancia_id: instanciaId,
      telefone_remoto: phoneToStore,
      conteudo: texto,
      direcao,
      tipo_conteudo: tipoConteudo,
      timestamp_msg: new Date().toISOString(),
    };
    if (mediaUrl) insertData.media_url = mediaUrl;

    await sb.from("whatsapp_mensagens").insert(insertData);
  } catch (e) {
    console.warn("[IA] Erro ao logar no inbox:", e);
  }
}

// ========== Decide if this response should be media ==========
async function tentarEnviarMidia(
  sb: any, serverUrl: string, instanceToken: string, numero: string,
  instanciaId: string, textoIA: string
): Promise<{ sent: boolean; tipo?: string }> {
  const rand = Math.random();

  // ~10% chance audio, ~10% chance image
  if (rand >= 0.20) return { sent: false };

  const isAudio = rand < 0.10;
  const pasta = isAudio ? "aquecimento" : "aquecimento-imagens";

  const arquivos = await listarMidiaAquecimento(sb, pasta);
  if (arquivos.length === 0) {
    console.log(`[IA] Sem arquivos em ${pasta}, enviando texto`);
    return { sent: false };
  }

  const arquivo = arquivos[Math.floor(Math.random() * arquivos.length)];
  const publicUrl = getPublicUrl(sb, "campaign-audio", `${pasta}/${arquivo}`);
  if (!publicUrl) return { sent: false };

  console.log(`[IA] 🎲 Sorteou ${isAudio ? "áudio" : "imagem"}: ${arquivo}`);

  let ok: boolean;
  let tipoConteudo: string;
  let descricao: string;

  if (isAudio) {
    ok = await enviarAudioUAZAPI(serverUrl, instanceToken, numero, publicUrl);
    tipoConteudo = "audio";
    descricao = `🎙️ Áudio enviado`;
  } else {
    ok = await enviarImagemUAZAPI(serverUrl, instanceToken, numero, publicUrl, textoIA.length < 80 ? textoIA : undefined);
    tipoConteudo = "imagem";
    descricao = `📷 Imagem enviada`;
  }

  if (ok) {
    await logToInbox(sb, instanciaId, numero, descricao, "saida", tipoConteudo, publicUrl);
    return { sent: true, tipo: tipoConteudo };
  }

  return { sent: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const sb = getSupabaseAdmin();

    // ========== Iniciar conversa com IA ==========
    if (action === "iniciar-conversa") {
      const {
        instancia_origem_id, instancia_destino_id,
        server_url, instance_token, numero_destino,
        numero_origem, dest_server_url, dest_instance_token,
      } = body;

      if (!instancia_origem_id || !instancia_destino_id) {
        return json({ error: "instancia_origem_id e instancia_destino_id obrigatórios" }, 400);
      }

      const duasHorasAtras = new Date(Date.now() - 2 * 3600000).toISOString();
      const { data: recente } = await sb
        .from("whatsapp_conversas_ia")
        .select("id")
        .or(`and(instancia_origem_id.eq.${instancia_origem_id},instancia_destino_id.eq.${instancia_destino_id}),and(instancia_origem_id.eq.${instancia_destino_id},instancia_destino_id.eq.${instancia_origem_id})`)
        .gte("ultima_msg_em", duasHorasAtras)
        .limit(1)
        .maybeSingle();

      if (recente) {
        console.log(`[IA] Cooldown ativo para par, pulando.`);
        return json({ started: false, reason: "cooldown" });
      }

      // Carrega fase da instância de origem (controla quais frases do pool podem ser usadas)
      const { data: aquecOrig } = await sb
        .from("whatsapp_aquecimento_instancias")
        .select("fase")
        .eq("instancia_id", instancia_origem_id)
        .maybeSingle();
      const faseOrigem = aquecOrig?.fase || 1;
      const mensagemInicial = await gerarMensagemInicial(faseOrigem);

      const maxTrocas = 4 + Math.floor(Math.random() * 5); // 4-8 trocas (realistic short conversation)
      const { data: conversa, error: convError } = await sb
        .from("whatsapp_conversas_ia")
        .insert({
          instancia_origem_id, instancia_destino_id,
          max_trocas: maxTrocas,
          historico: [{ role: "enviada", content: mensagemInicial, ts: new Date().toISOString() }],
          total_trocas: 1,
          ultima_msg_em: new Date().toISOString(),
        })
        .select().single();

      if (convError) {
        console.error("[IA] Erro ao criar conversa:", convError);
        return json({ error: "Erro ao criar conversa" }, 500);
      }

      // Ensure contacts exist on both sides
      if (numero_destino && numero_origem) {
        const cleanDest = numero_destino.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
        const cleanOrig = numero_origem.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
        const suffDest = cleanDest.replace(/^55/, "").slice(-8);
        const suffOrig = cleanOrig.replace(/^55/, "").slice(-8);

        const [{ data: origInst }, { data: destInst }] = await Promise.all([
          sb.from("user_whatsapp_instances").select("nome").eq("id", instancia_origem_id).single(),
          sb.from("user_whatsapp_instances").select("nome").eq("id", instancia_destino_id).single(),
        ]);
        const nomeOrig = origInst?.nome || cleanOrig;
        const nomeDest = destInst?.nome || cleanDest;

        const { data: c1 } = await sb.from("whatsapp_contatos")
          .select("id").eq("instancia_id", instancia_origem_id)
          .or(`telefone.eq.${cleanDest},telefone.ilike.%${suffDest}`)
          .maybeSingle();
        if (!c1) {
          await sb.from("whatsapp_contatos").insert({
            instancia_id: instancia_origem_id, telefone: cleanDest, nome: nomeDest,
          });
        }

        const { data: c2 } = await sb.from("whatsapp_contatos")
          .select("id").eq("instancia_id", instancia_destino_id)
          .or(`telefone.eq.${cleanOrig},telefone.ilike.%${suffOrig}`)
          .maybeSingle();
        if (!c2) {
          await sb.from("whatsapp_contatos").insert({
            instancia_id: instancia_destino_id, telefone: cleanOrig, nome: nomeOrig,
          });
        }

        await Promise.all([
          salvarContatoUAZAPI(server_url, instance_token, cleanDest, nomeDest),
          dest_server_url && dest_instance_token
            ? salvarContatoUAZAPI(dest_server_url, dest_instance_token, cleanOrig, nomeOrig)
            : Promise.resolve(),
        ]);
      }

      // Send initial message (may be media ~20% of the time)
      if (server_url && instance_token && numero_destino) {
        // Send typing indicator before first message
        await enviarTypingIndicator(server_url, instance_token, numero_destino, mensagemInicial.length);
        
        let sentAsMedia = false;
        const mediaResult = await tentarEnviarMidia(sb, server_url, instance_token, numero_destino, instancia_origem_id, mensagemInicial);
        sentAsMedia = mediaResult.sent;

        if (!sentAsMedia) {
          const sent = await enviarMensagemUAZAPI(server_url, instance_token, numero_destino, mensagemInicial, { instancia_origem_id, instancia_destino_id });
          if (sent) {
            await logToInbox(sb, instancia_origem_id, numero_destino, mensagemInicial, "saida");
          }
        }

        await sb.from("whatsapp_aquecimento_interacoes").insert({
          instancia_origem_id, instancia_destino_id,
          tipo: mediaResult.sent ? (mediaResult.tipo || "texto") : "texto",
          conteudo: mensagemInicial,
          status: "ENVIADO", enviado_em: new Date().toISOString(),
          tipo_interacao: "mensagem",
        });

        const delayMs = humanizedDelay();
        console.log(`[IA] 🔄 ${instancia_destino_id} responderá em ${Math.round(delayMs / 1000)}s`);

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        fetch(`${supabaseUrl}/functions/v1/whatsapp-ia-responder`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            action: "gerar-resposta",
            mensagem: mensagemInicial,
            instancia_origem_id: instancia_destino_id,
            instancia_destino_id: instancia_origem_id,
            delay_ms: delayMs,
            server_url: dest_server_url,
            instance_token: dest_instance_token,
            numero_destino: numero_origem,
          }),
        }).catch(err => console.error("[IA] Erro ao disparar resposta:", err));
      }

      console.log(`[IA] 🆕 Conversa iniciada: ${conversa.id} (max ${maxTrocas} trocas)`);
      return json({ started: true, conversa_id: conversa.id, mensagem: mensagemInicial });
    }

    // ========== Gerar resposta (chain) ==========
    if (action === "gerar-resposta") {
      const {
        mensagem, instancia_origem_id, instancia_destino_id,
        delay_ms, server_url, instance_token, numero_destino,
      } = body;

      if (!mensagem || !instancia_origem_id || !instancia_destino_id) {
        return json({ error: "campos obrigatórios faltando" }, 400);
      }

      const delayMs = delay_ms || 0;
      if (delayMs > 0) {
        console.log(`[IA] Aguardando ${Math.round(delayMs / 1000)}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const LIMITE_DIARIO_REAL = 15;
      const { data: instAquec } = await sb
        .from("whatsapp_aquecimento_instancias")
        .select("id, interacoes_hoje, interacoes_total, fase")
        .eq("instancia_id", instancia_origem_id)
        .maybeSingle();
      const faseRespondedor = instAquec?.fase || 1;

      if (instAquec && instAquec.interacoes_hoje >= LIMITE_DIARIO_REAL) {
        console.log(`[IA] 🛑 Instância ${instancia_origem_id} atingiu limite diário (${instAquec.interacoes_hoje}/${LIMITE_DIARIO_REAL}). Finalizando conversa.`);
        const { data: convToFinish } = await sb
          .from("whatsapp_conversas_ia")
          .select("id")
          .or(`and(instancia_origem_id.eq.${instancia_origem_id},instancia_destino_id.eq.${instancia_destino_id}),and(instancia_origem_id.eq.${instancia_destino_id},instancia_destino_id.eq.${instancia_origem_id})`)
          .eq("status", "ATIVA")
          .maybeSingle();
        if (convToFinish) {
          await sb.from("whatsapp_conversas_ia").update({ status: "FINALIZADA" }).eq("id", convToFinish.id);
        }
        return json({ responded: false, reason: "daily_limit_reached" });
      }

      const { data: conversa } = await sb
        .from("whatsapp_conversas_ia")
        .select("*")
        .or(`and(instancia_origem_id.eq.${instancia_origem_id},instancia_destino_id.eq.${instancia_destino_id}),and(instancia_origem_id.eq.${instancia_destino_id},instancia_destino_id.eq.${instancia_origem_id})`)
        .eq("status", "ATIVA")
        .order("inicio_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversa) {
        console.log("[IA] Nenhuma conversa ativa encontrada.");
        return json({ responded: false, reason: "no_conversation" });
      }

      if (conversa.total_trocas >= conversa.max_trocas) {
        const historicoArr = (conversa.historico || []) as any[];
        const historicoTexto = historicoArr.slice(-10)
          .map((m: any) => `${m.role === "enviada" ? "Eu" : "Amigo"}: ${m.content}`).join("\n");

        const fraseEncerramento = await chamarIA(mensagem, historicoTexto, conversa.total_trocas, conversa.max_trocas, { instancia_origem_id, instancia_destino_id, numero_destino }, faseRespondedor);

        const novoHistorico = [
          ...historicoArr,
          { role: "recebida", content: mensagem, ts: new Date().toISOString() },
          { role: "enviada", content: fraseEncerramento, ts: new Date().toISOString() },
        ];
        await sb.from("whatsapp_conversas_ia").update({
          status: "FINALIZADA", total_trocas: conversa.total_trocas + 1,
          ultima_msg_em: new Date().toISOString(), historico: novoHistorico,
        }).eq("id", conversa.id);

        if (server_url && instance_token && numero_destino) {
          const sent = await enviarMensagemUAZAPI(server_url, instance_token, numero_destino, fraseEncerramento, { instancia_origem_id, instancia_destino_id });
          if (sent) {
            await logToInbox(sb, instancia_origem_id, numero_destino, fraseEncerramento, "saida");
          }
        }

        console.log(`[IA] 🏁 Conversa ${conversa.id} finalizada após ${conversa.total_trocas + 1} trocas`);
        return json({ responded: true, resposta: fraseEncerramento, finalizada: true });
      }

      // Backup: save contacts on first response
      if (conversa.total_trocas <= 1 && server_url && instance_token && numero_destino) {
        try {
          const { data: origInst } = await sb.from("user_whatsapp_instances")
            .select("nome, server_url, instance_token").eq("id", instancia_origem_id).single();
          const { data: destInst } = await sb.from("user_whatsapp_instances")
            .select("nome, server_url, instance_token").eq("id", instancia_destino_id).single();
          
          if (origInst && destInst) {
            const cleanDest = numero_destino.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
            const origPhone = origInst.nome?.match(/^\d+/)?.[0] || "";
            const nomeOrig = origInst.nome || origPhone;
            const nomeDest = destInst.nome || cleanDest;
            
            await salvarContatoUAZAPI(server_url, instance_token, cleanDest, nomeDest);
            if (origPhone && destInst.server_url && destInst.instance_token) {
              await salvarContatoUAZAPI(destInst.server_url, destInst.instance_token, `55${origPhone}`, nomeOrig);
            }
          }
        } catch (e) {
          console.warn("[IA] Backup contato erro:", e);
        }
      }

      // Generate response
      const historicoArr = (conversa.historico || []) as any[];
      const historicoTexto = historicoArr.slice(-10)
        .map((m: any) => `${m.role === "enviada" ? "Eu" : "Amigo"}: ${m.content}`).join("\n");

      // Skip silencioso por fase: simula humano que nem sempre responde
      if (!deveResponderPorFase(faseRespondedor)) {
        console.log(`[IA-Pool] Skip por fase ${faseRespondedor} (humano "ocupado")`);
        await sb.from("whatsapp_conversas_ia").update({
          ultima_msg_em: new Date().toISOString(),
          historico: [...((conversa.historico || []) as any[]), { role: "recebida", content: mensagem, ts: new Date().toISOString() }],
        }).eq("id", conversa.id);
        return json({ responded: false, reason: "skip_por_fase" });
      }

      const resposta = await chamarIA(mensagem, historicoTexto, conversa.total_trocas, conversa.max_trocas, { instancia_origem_id, instancia_destino_id, numero_destino }, faseRespondedor);

      const novoHistorico = [
        ...historicoArr,
        { role: "recebida", content: mensagem, ts: new Date().toISOString() },
        { role: "enviada", content: resposta, ts: new Date().toISOString() },
      ];
      const novaTroca = conversa.total_trocas + 1;

      await sb.from("whatsapp_conversas_ia").update({
        total_trocas: novaTroca,
        ultima_msg_em: new Date().toISOString(),
        historico: novoHistorico,
      }).eq("id", conversa.id);

      if (instAquec) {
        await sb.from("whatsapp_aquecimento_instancias").update({
          interacoes_hoje: (instAquec.interacoes_hoje || 0) + 1,
          interacoes_total: (instAquec.interacoes_total || 0) + 1,
          ultima_interacao: new Date().toISOString(),
        }).eq("id", instAquec.id);
      }

      // Send message — try media first (~20%), fallback to text
      if (server_url && instance_token && numero_destino) {
        // Send typing indicator before each response
        await enviarTypingIndicator(server_url, instance_token, numero_destino, resposta.length);
        
        const mediaResult = await tentarEnviarMidia(sb, server_url, instance_token, numero_destino, instancia_origem_id, resposta);
        
        if (!mediaResult.sent) {
          const sent = await enviarMensagemUAZAPI(server_url, instance_token, numero_destino, resposta, { instancia_origem_id, instancia_destino_id });
          if (sent) {
            await logToInbox(sb, instancia_origem_id, numero_destino, resposta, "saida");
          }
        }
      }

      // Chain: trigger other side to respond
      if (novaTroca < conversa.max_trocas) {
        const outroLado = instancia_origem_id === conversa.instancia_origem_id
          ? conversa.instancia_destino_id : conversa.instancia_origem_id;
        const esteLado = instancia_origem_id;

        const { data: outroInst } = await sb
          .from("user_whatsapp_instances")
          .select("id, server_url, instance_token, nome")
          .eq("id", outroLado)
          .eq("ativo", true)
          .single();

        if (outroInst) {
          const { data: esteInst } = await sb
            .from("user_whatsapp_instances")
            .select("nome")
            .eq("id", esteLado)
            .single();

          const estePhone = esteInst?.nome?.match(/^\d+/)?.[0] || "";

          if (estePhone) {
            const delayNext = humanizedDelay();
            console.log(`[IA] 🔄 Cadeia: ${outroInst.nome} responderá em ${Math.round(delayNext / 1000)}s`);

            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

            fetch(`${supabaseUrl}/functions/v1/whatsapp-ia-responder`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                action: "gerar-resposta",
                mensagem: resposta,
                instancia_origem_id: outroLado,
                instancia_destino_id: esteLado,
                delay_ms: delayNext,
                server_url: outroInst.server_url,
                instance_token: outroInst.instance_token,
                numero_destino: `55${estePhone}@s.whatsapp.net`,
              }),
            }).catch(err => console.error("[IA] Erro cadeia:", err));
          }
        }
      } else {
        console.log(`[IA] 🏁 Conversa ${conversa.id} atingiu limite (${novaTroca}/${conversa.max_trocas})`);
      }

      return json({ responded: true, resposta, troca: novaTroca, maxTrocas: conversa.max_trocas });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (err) {
    console.error("[IA-RESPONDER] Erro:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
