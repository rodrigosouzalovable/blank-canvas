import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Precise group/broadcast/noise filter — applied AFTER JSON.parse so it only inspects
// the chat identifier fields (never the full body, which often contains '@g.us' in
// metadata like instanceOwner of legitimate DMs).
function isBlockedRemoteJid(remoteJid: string | null | undefined) {
  const normalized = (remoteJid || '').toLowerCase();
  return normalized.endsWith('@g.us') || normalized === 'status@broadcast' || normalized.includes('@broadcast');
}

function isBlockedParsedPayload(payload: any): { blocked: boolean; reason?: string } {
  if (!payload || typeof payload !== 'object') return { blocked: false };

  const candidates: unknown[] = [
    payload.chatid,
    payload.chatId,
    payload.remoteJid,
    payload.from,
    payload.key?.remoteJid,
    payload.message?.key?.remoteJid,
    payload.message?.chatid,
    payload.message?.chatId,
    payload.data?.key?.remoteJid,
    payload.data?.chatid,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isBlockedRemoteJid(c)) {
      return { blocked: true, reason: `group_or_broadcast:${c}` };
    }
  }

  if (payload.isGroup === true || payload.wa_isGroup === true || payload.message?.isGroup === true) {
    return { blocked: true, reason: 'isGroup_flag' };
  }

  const msgType = (payload.messageType || payload.message?.messageType || payload.type || '').toString().toLowerCase();
  if (msgType === 'reactionmessage' || msgType === 'protocolmessage') {
    return { blocked: true, reason: `noise_type:${msgType}` };
  }

  return { blocked: false };
}

function getImageDimensions(bytes: Uint8Array, mimeType?: string): { width: number; height: number } | null {
  const mime = (mimeType || '').toLowerCase();

  if (bytes.length >= 24 && (mime.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47))) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (bytes.length >= 10 && (mime.includes('gif') || (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46))) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (bytes.length >= 30 && (mime.includes('webp') || (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46))) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }

  if (mime.includes('jpeg') || mime.includes('jpg') || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    let offset = 2;
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 || marker === 0xc5 || marker === 0xc6 || marker === 0xc7 || marker === 0xc9 || marker === 0xca || marker === 0xcb || marker === 0xcd || marker === 0xce || marker === 0xcf) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

async function isTinyImageBlob(blob: Blob): Promise<boolean> {
  const mime = (blob.type || '').toLowerCase();
  if (!mime.startsWith('image/')) return false;

  const headerBytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer());
  const dims = getImageDimensions(headerBytes, mime);
  if (!dims) return blob.size < 10_000;

  return dims.width <= 160 || dims.height <= 160 || blob.size < 10_000;
}

// ===== WhatsApp .enc media decryption helpers =====
const MEDIA_HKDF_INFO: Record<string, string> = {
  'imagem': 'WhatsApp Image Keys',
  'audio': 'WhatsApp Audio Keys',
  'video': 'WhatsApp Video Keys',
  'documento': 'WhatsApp Document Keys',
};

// Extract text from all message types including button/list responses
function extractTextFromPayload(payload: any): string {
  // UAZAPI button/list response (highest priority — client clicked a button)
  const buttonOrListId = (payload?.message?.buttonOrListid || '').toString().trim();
  if (buttonOrListId) {
    console.log(`[EXTRACT] Button/List response detected: "${buttonOrListId}"`);
    return buttonOrListId;
  }

  // Standard text fields
  const standardText = (
    payload?.message?.text ||
    payload?.body ||
    payload?.text ||
    payload?.message?.body ||
    payload?.message?.conversation ||
    payload?.message?.extendedTextMessage?.text ||
    payload?.message?.content?.text ||
    ''
  ).toString().trim();
  if (standardText) return standardText;

  // Button response (Baileys format)
  const buttonsResponse = payload?.message?.buttonsResponseMessage;
  if (buttonsResponse) {
    return (buttonsResponse.selectedDisplayText || buttonsResponse.selectedButtonId || '').trim();
  }

  // List response (when client selects from a list)
  const listResponse = payload?.message?.listResponseMessage;
  if (listResponse) {
    return (listResponse.title || listResponse.description || listResponse.singleSelectReply?.selectedRowId || '').trim();
  }

  // Template button reply
  const templateReply = payload?.message?.templateButtonReplyMessage;
  if (templateReply) {
    return (templateReply.selectedDisplayText || templateReply.selectedId || '').trim();
  }

  // Interactive response (newer WhatsApp format)
  const interactiveResponse = payload?.message?.interactiveResponseMessage;
  if (interactiveResponse) {
    try {
      const body = JSON.parse(interactiveResponse.nativeFlowResponseMessage?.paramsJson || '{}');
      return (body?.id || interactiveResponse.body?.text || '').trim();
    } catch {
      return (interactiveResponse.body?.text || '').trim();
    }
  }

  return '';
}

// === SALVAR CONTATO NA AGENDA FÍSICA DO DISPOSITIVO VIA UAZAPI ===
async function salvarContatoUAZAPI(baseUrl: string, token: string, numero: string, nome: string): Promise<boolean> {
  if (!baseUrl || !token || !numero || !nome) return false;
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const cleanNumber = numero.replace(/\D/g, '');
  const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
  
  const endpoints = [
    `${cleanUrl}/contact/add`,
    `${cleanUrl}/contacts/add`,
    `${cleanUrl}/contact/upsert`,
    `${cleanUrl}/contacts/upsert`,
  ];
  
  const payloads = [
    { number: cleanNumber, name: nome },
    { number: jid, name: nome },
    { jid, name: nome },
    { phone: cleanNumber, name: nome },
  ];
  
  for (const url of endpoints) {
    for (const payload of payloads) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          console.log(`[CONTATO-AGENDA] ✅ Salvo: ${nome} (${cleanNumber}) via ${url}`);
          return true;
        }
        const txt = await res.text();
        console.log(`[CONTATO-AGENDA] ${url} status=${res.status} body=${txt.slice(0, 200)}`);
      } catch (e) {
        console.log(`[CONTATO-AGENDA] Erro ${url}: ${e}`);
      }
    }
  }
  console.warn(`[CONTATO-AGENDA] ❌ Nenhum endpoint funcionou para ${nome} (${cleanNumber})`);
  return false;
}

function extractMediaMetadata(payload: any) {
  const content = payload?.message?.content || {};
  const imageMsg = payload?.message?.imageMessage || {};
  const audioMsg = payload?.message?.audioMessage || {};
  const videoMsg = payload?.message?.videoMessage || {};
  const docMsg = payload?.message?.documentMessage || {};
  const msg = payload?.message || {};

  // Merge all possible sources
  const sources = [content, imageMsg, audioMsg, videoMsg, docMsg, msg];

  const pick = (keys: string[]) => {
    for (const src of sources) {
      for (const k of keys) {
        if (src[k]) return src[k];
      }
    }
    return null;
  };

  return {
    encUrl: pick(['URL', 'url', 'imageLink', 'mediaUrl', 'directPath']),
    mediaKey: pick(['mediaKey']),
    fileEncSha256: pick(['fileEncSha256', 'fileEncSHA256']),
    fileSha256: pick(['fileSha256', 'fileSHA256']),
    fileLength: Number(pick(['fileLength']) || 0),
    mimetype: pick(['mimetype', 'mimeType']) || '',
    width: Number(pick(['width']) || 0),
    height: Number(pick(['height']) || 0),
  };
}

async function decryptWhatsAppMedia(
  encUrl: string,
  mediaKeyB64: string,
  mediaType: string,
  expectedMime: string,
): Promise<Blob | null> {
  try {
    const infoString = MEDIA_HKDF_INFO[mediaType] || 'WhatsApp Image Keys';
    console.log(`[MEDIA-DECRYPT] Iniciando descriptografia. URL=${encUrl.substring(0, 80)}... info="${infoString}"`);

    // 1. Download encrypted file
    const encResp = await fetch(encUrl);
    if (!encResp.ok) {
      console.warn(`[MEDIA-DECRYPT] Falha ao baixar .enc: HTTP ${encResp.status}`);
      await encResp.text();
      return null;
    }
    const encBuffer = new Uint8Array(await encResp.arrayBuffer());
    console.log(`[MEDIA-DECRYPT] Arquivo .enc baixado: ${encBuffer.length} bytes`);

    if (encBuffer.length < 10) {
      console.warn(`[MEDIA-DECRYPT] Arquivo .enc muito pequeno: ${encBuffer.length} bytes`);
      return null;
    }

    // 2. Decode mediaKey from base64
    const binaryStr = atob(mediaKeyB64);
    const mediaKeyBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) mediaKeyBytes[i] = binaryStr.charCodeAt(i);

    // 3. HKDF expand: derive 112 bytes using SHA-256
    const infoBytes = new TextEncoder().encode(infoString);
    const mediaKeyMaterial = await crypto.subtle.importKey('raw', mediaKeyBytes, 'HKDF', false, ['deriveBits']);
    const expandedBits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: infoBytes },
      mediaKeyMaterial,
      112 * 8, // 112 bytes
    );
    const expanded = new Uint8Array(expandedBits);

    // 4. Split expanded key: iv(16) + cipherKey(32) + macKey(32) + refKey(32)
    const iv = expanded.slice(0, 16);
    const cipherKey = expanded.slice(16, 48);
    // macKey = expanded.slice(48, 80); // not needed for decryption
    // refKey = expanded.slice(80, 112); // not used

    // 5. Strip last 10 bytes (MAC) from encrypted data
    const ciphertext = encBuffer.slice(0, encBuffer.length - 10);

    // 6. AES-CBC decrypt
    const aesKey = await crypto.subtle.importKey('raw', cipherKey, { name: 'AES-CBC' }, false, ['decrypt']);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext);

    const decryptedBytes = new Uint8Array(decryptedBuffer);
    console.log(`[MEDIA-DECRYPT] ✅ Descriptografia OK! Tamanho: ${decryptedBytes.length} bytes`);

    // 7. Validate magic bytes
    const mime = expectedMime || 'application/octet-stream';
    const blob = new Blob([decryptedBytes], { type: mime });

    // Quick sanity: check if first bytes look like valid media
    if (decryptedBytes.length > 4) {
      const isJpeg = decryptedBytes[0] === 0xFF && decryptedBytes[1] === 0xD8;
      const isPng = decryptedBytes[0] === 0x89 && decryptedBytes[1] === 0x50;
      const isWebp = decryptedBytes[0] === 0x52 && decryptedBytes[1] === 0x49;
      const isOgg = decryptedBytes[0] === 0x4F && decryptedBytes[1] === 0x67;
      const isPdf = decryptedBytes[0] === 0x25 && decryptedBytes[1] === 0x50;
      const isAnyKnown = isJpeg || isPng || isWebp || isOgg || isPdf || (decryptedBytes[3] === 0x66); // mp4 ftyp

      if (!isAnyKnown) {
        console.warn(`[MEDIA-DECRYPT] ⚠️ Magic bytes não reconhecidos após decrypt: [${Array.from(decryptedBytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(',')}]`);
        // Still return it — might be a format we don't check for
      }
    }

    return blob;
  } catch (err) {
    console.error(`[MEDIA-DECRYPT] ❌ Erro na descriptografia:`, err);
    return null;
  }
}

const VALOR_MINIMO_PARCELA = 100;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function gerarListaParcelamento(valorParcelado: number): string {
  const linhas: string[] = [];
  for (let i = 2; i <= 24; i++) {
    const valorParcela = valorParcelado / i;
    if (valorParcela < VALOR_MINIMO_PARCELA) break;
    linhas.push(`${i}x de *${formatCurrency(Math.ceil(valorParcela * 100) / 100)}*`);
  }
  return linhas.join('\n');
}

function gerarMensagemProposta(valorAvista: number, valorParcelado: number): string {
  const listaParcelamento = gerarListaParcelamento(valorParcelado);
  let msg = `Que ótimo! 🎉\n\nEstamos com uma super oportunidade para você quitar todo débito em aberto pelo valor de *${formatCurrency(valorAvista)}* à vista.`;
  if (listaParcelamento) {
    msg += `\n\nOu podemos parcelar para você da seguinte forma:\n\n${listaParcelamento}`;
  }
  msg += `\n\nComo prefere pagar? Responda com o número de parcelas desejado (ex: *3x*) ou *à vista*.`;
  return msg;
}

function extractCpf(text: string): string | null {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length === 11) return cleaned;
  const match = text.match(/\d{11}/);
  if (match) return match[0];
  const formatted = text.match(/(\d{3})[.\s-]?(\d{3})[.\s-]?(\d{3})[.\s-]?(\d{2})/);
  if (formatted) return formatted[1] + formatted[2] + formatted[3] + formatted[4];
  return null;
}

function formatCpf(cpf: string): string {
  const c = cpf.replace(/\D/g, '');
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

async function simulateTyping(serverUrl: string, instanceToken: string, telefone: string, durationMs: number) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [`${cleanUrl}/chat/presence`, `${cleanUrl}/chatState`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({ number: telefone, state: 'composing' }),
      });
      if (res.ok) break;
    } catch (e) { console.log(`Presença falhou: ${url}`, e); }
  }
  await new Promise(r => setTimeout(r, durationMs));
}

async function sendMessage(serverUrl: string, instanceToken: string, telefone: string, mensagem: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const endpoints = [`${cleanUrl}/message/sendText`, `${cleanUrl}/sendText`, `${cleanUrl}/send/text`];
  let lastError = null;
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({ number: telefone, text: mensagem }),
      });
      const data = await response.json();
      if (response.ok) return data;
      lastError = data;
    } catch (e) { lastError = e; }
  }
  throw new Error(lastError?.message || 'Falha ao enviar mensagem UAZAPI');
}

// ===== OLLAMA LOCAL (gratuito) — substitui Lovable AI Gateway =====
const OLLAMA_URL = Deno.env.get('OLLAMA_NGROK_URL') || '';
const OLLAMA_MODEL = 'gemma4:e4b';

async function chamarOllama(systemPrompt: string, userPrompt: string, maxTokens = 80, temperature = 0): Promise<string | null> {
  if (!OLLAMA_URL) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${OLLAMA_URL.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.message?.content || '').trim() || null;
  } catch (e) {
    console.error('[OLLAMA] erro:', e instanceof Error ? e.message : e);
    return null;
  }
}

// Cache em memória — mensagens repetidas não chamam IA
const gatilhoCache = new Map<string, string>();
const intencaoCache = new Map<string, string | null>();
const CACHE_MAX = 500;
function setCacheLimited<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= CACHE_MAX) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

// Curto-circuito local — resolve ~70% das mensagens sem IA
function gatilhoLocal(texto: string): string | null {
  const t = texto.toLowerCase().trim().replace(/[!?.,;]/g, '');
  if (!t) return null;
  if (t.length <= 25) {
    const confirma = ['sim', 'ok', 'okay', 'beleza', 'fechado', 'fechou', 'pode', 'pode ser', 'aceito', 'concordo', 'tá', 'ta', 'tá bom', 'ta bom', 'isso', 'claro', 'perfeito', 'combinado', 'show', 'blz', 's'];
    if (confirma.includes(t)) return 'sim';
    const nega = ['não', 'nao', 'n', 'não posso', 'nao posso', 'não dá', 'nao da', 'não consigo', 'nao consigo', 'jamais', 'nunca'];
    if (nega.includes(t)) return 'não';
    const adia = ['depois', 'amanhã', 'amanha', 'mais tarde', 'logo mais', 'em breve', 'semana que vem', 'mês que vem', 'mes que vem', 'vou ver', 'vou pensar', 'preciso pensar', 'me da um tempo', 'me dá um tempo'];
    if (adia.some(a => t === a || t.includes(a))) return 'vou ver';
  }
  return null;
}

function intencaoLocal(texto: string, opcoes: string[]): string | null {
  const t = texto.toLowerCase().trim();
  // Match direto
  for (const op of opcoes) {
    if (t === op.toLowerCase() || t.includes(op.toLowerCase())) return op.toLowerCase();
  }
  // Confirmações
  const opcoesLower = opcoes.map(o => o.toLowerCase());
  const isConfirm = ['sim', 'ok', 'beleza', 'pode', 'aceito', 'fechado', 'isso', 's', 'claro'].includes(t);
  const isNega = ['não', 'nao', 'n'].includes(t);
  if (isConfirm) {
    const aceitar = opcoesLower.find(o => /aceit|sim|confirm|fechar|pagar|à vista|avista|parcel/.test(o));
    if (aceitar) return aceitar;
  }
  if (isNega) {
    const recusar = opcoesLower.find(o => /recus|não|nao|cancel/.test(o));
    if (recusar) return recusar;
  }
  return null;
}

// Transcrição de áudio DESABILITADA (custo zero) — bot pede texto
async function transcreverAudio(_audioUrl: string): Promise<string> {
  throw new Error('AUDIO_DISABLED');
}

const ADMIN_NUMERO = '5562991672674';

function isAdminNumber(tel: string): boolean {
  const normalized = tel.replace(/\D/g, '');
  return normalized === '5562991672674' || normalized === '62991672674';
}

function parseAdminInstruction(texto: string): { literal: boolean; conteudo: string } {
  // Check for text wrapped in quotes (both regular and smart quotes)
  const match = texto.match(/^[""\u201C](.+)[""\u201D]$/s);
  if (match) return { literal: true, conteudo: match[1].trim() };
  return { literal: false, conteudo: texto.trim() };
}

function parseAdminInstructionWithTarget(texto: string): { telefoneAlvo: string | null; instrucao: string } {
  // Detecta padrões naturais como:
  // "Volta na conversa com +556493097974 e passe a proposta"
  // "Responda ao numero 556493097974 com a proposta"
  // "Envie para 62993097974: ..." / "Mande para o 556493097974 a proposta"
  // "Passe a negociação para 556493097974"
  const match = texto.match(/(?:volt[ae]|retorn[ea]|responda|envie?|mande?|fale?|passe|vá|vai).*?(?:numero|número|n[uú]m|para|ao|com|do|da|de)\s*\+?(\d{10,13})\s*(?:com|e|:|\s)?\s*(.*)/i);
  if (match) {
    let tel = match[1].replace(/\D/g, '');
    if (tel.length === 11) tel = '55' + tel;
    if (tel.length === 10) tel = '55' + tel;
    return { telefoneAlvo: tel, instrucao: match[2].trim() };
  }
  return { telefoneAlvo: null, instrucao: texto };
}

async function gerarRespostaComInstrucaoAdmin(instrucao: string, contextoConversa: any): Promise<string> {
  const historico = contextoConversa?.mensagens_historico || [];
  const historicoTexto = historico.slice(-10).map((m: any) => `${m.role}: ${m.content}`).join('\n');
  const nomeCliente = contextoConversa?.nome || 'cliente';
  const primeiroNome = nomeCliente.split(' ')[0];

  const sys = `Você é um assistente de cobrança amigável e profissional. O administrador Rodrigo está instruindo como responder ao cliente ${primeiroNome}.
Gere uma resposta natural e amigável para o cliente baseada na instrução do administrador.
Mantenha o tom informal e cordial. Não mencione o administrador. Responda APENAS com a mensagem para o cliente, sem explicações.`;
  const usr = `Contexto da conversa:\n${historicoTexto}\n\nInstrução do administrador: "${instrucao}"\n\nGere a resposta para o cliente:`;

  const out = await chamarOllama(sys, usr, 300, 0.7);
  return out || instrucao;
}

async function notificarAdmin(serverUrl: string, instanceToken: string, telefoneCliente: string, telefoneInstancia: string, textoCliente: string) {
  try {
    const msg = `Olá Rodrigo, na mensagem enviada pelo número ${telefoneInstancia} para o número ${telefoneCliente}, o cliente respondeu algo que eu não soube informar: "${textoCliente}". Você poderia analisar por favor?`;
    console.log(`[ADMIN] Notificando admin: ${msg}`);
    await sendMessage(serverUrl, instanceToken, ADMIN_NUMERO, msg);
  } catch (e) {
    console.error('[ADMIN] Falha ao notificar admin:', e);
  }
}

async function notificarAcordoFechado(serverUrl: string, instanceToken: string, telefoneCliente: string, dados: any) {
  try {
    const nomeCliente = dados.nome || 'cliente';
    const primeiroNome = nomeCliente.split(' ')[0];
    const tipo = dados.tipo_pagamento;
    const dataPgto = dados.data_pagamento || 'hoje';

    let detalhes = '';
    if (tipo === 'avista') {
      const valor = Number(dados.valor_final || dados.valor_avista);
      detalhes = `à vista por ${formatCurrency(valor)}`;
    } else {
      const parcelas = Number(dados.parcelas || dados.max_parcelas);
      const valorTotal = Number(dados.valor_final || dados.valor_parcelado);
      const valorParcela = valorTotal / parcelas;
      detalhes = `em ${parcelas}x de ${formatCurrency(valorParcela)}`;
    }

    const telefoneFormatado = telefoneCliente.replace(/^55/, '');
    const msg = `Rodrigo, acabei de fechar um acordo com o cliente ${primeiroNome}, número ${telefoneFormatado}, ${detalhes}, para pagamento ${dataPgto}.`;
    console.log(`[ACORDO] Notificando admin: ${msg}`);
    await sendMessage(serverUrl, instanceToken, ADMIN_NUMERO, msg);
  } catch (e) {
    console.error('[ACORDO] Falha ao notificar admin sobre acordo:', e);
  }
}

// Extrai gatilho — curto-circuito local, cache, depois Ollama
async function extrairGatilho(mensagemCliente: string): Promise<string> {
  const fallback = mensagemCliente.toLowerCase().slice(0, 50);
  const chave = mensagemCliente.toLowerCase().trim().slice(0, 100);

  // 1. Cache
  const cached = gatilhoCache.get(chave);
  if (cached !== undefined) return cached;

  // 2. Curto-circuito local (resolve a maioria — sim/não/ok/depois)
  const local = gatilhoLocal(mensagemCliente);
  if (local) {
    setCacheLimited(gatilhoCache, chave, local);
    return local;
  }

  // 3. Ollama local (gratuito)
  const sys = `Você extrai palavras-chave (gatilho) de mensagens de clientes. Responda APENAS com 1-4 palavras-chave em minúsculas, sem pontuação.
Exemplos:
"Vou ver aqui" -> "vou ver"
"Não sei se consigo" -> "não sei se consigo"
"Preciso pensar melhor" -> "preciso pensar"`;
  const out = await chamarOllama(sys, `Extraia o gatilho: "${mensagemCliente}"`, 30, 0);
  const result = (out?.toLowerCase() || fallback).slice(0, 50);
  setCacheLimited(gatilhoCache, chave, result);
  return result;
}

async function registrarAprendizado(
  supabase: any,
  mensagemCliente: string,
  respostaConfirmada: string,
  contexto: any
): Promise<string> {
  try {
    // Extrair gatilho usando IA
    const gatilho = await extrairGatilho(mensagemCliente);
    
    // Criar template com variáveis
    let respostaTemplate = respostaConfirmada;
    
    // Substituir nome do cliente por variável
    if (contexto?.nome) {
      const primeiroNome = contexto.nome.split(' ')[0];
      const regex = new RegExp(`\\b${primeiroNome}\\b`, 'gi');
      respostaTemplate = respostaTemplate.replace(regex, '{primeiro_nome}');
    }
    
    // Substituir valores monetários por variáveis se existirem no contexto
    if (contexto?.valor_avista) {
      const valorFormatado = formatCurrency(contexto.valor_avista);
      respostaTemplate = respostaTemplate.replace(valorFormatado, '{valor_avista}');
    }
    if (contexto?.valor_parcelado) {
      const valorFormatado = formatCurrency(contexto.valor_parcelado);
      respostaTemplate = respostaTemplate.replace(valorFormatado, '{valor_parcelado}');
    }
    
    // Inserir regra no banco de dados
    const { error } = await supabase
      .from('chatbot_regras')
      .insert({
        gatilho: gatilho,
        resposta: respostaTemplate,
        ativo: true
      });
    
    if (error) {
      console.error('[APRENDIZADO] Erro ao criar regra:', error);
      return gatilho;
    }
    
    console.log(`[APRENDIZADO] Nova regra criada: gatilho="${gatilho}" -> resposta="${respostaTemplate}"`);
    return gatilho;
  } catch (e) {
    console.error('[APRENDIZADO] Erro:', e);
    return mensagemCliente.slice(0, 30);
  }
}

async function interpretarIntencao(texto: string, opcoes: string[]): Promise<string | null> {
  const chave = `${texto.toLowerCase().trim().slice(0, 80)}::${opcoes.join('|').toLowerCase()}`;

  // 1. Cache
  if (intencaoCache.has(chave)) return intencaoCache.get(chave) ?? null;

  // 2. Curto-circuito local
  const local = intencaoLocal(texto, opcoes);
  if (local) {
    setCacheLimited(intencaoCache, chave, local);
    return local;
  }

  // 3. Ollama local
  const sys = `Hoje é ${new Date().toLocaleDateString('pt-BR')}. Você interpreta a intenção do cliente em uma negociação de dívida. Responda APENAS com uma das opções listadas.`;
  const usr = `O cliente disse: "${texto}"\n\nOpções: ${opcoes.join(', ')}\n\nResponda APENAS com uma das opções, ou "nenhuma".`;
  const out = await chamarOllama(sys, usr, 30, 0);
  const result = out?.toLowerCase() || null;
  setCacheLimited(intencaoCache, chave, result);
  return result;
}

// Extract a date from text like "dia 15", "15/03", "amanha", "segunda"
function extrairData(texto: string): Date | null {
  const hoje = new Date();
  const textoLower = texto.toLowerCase().trim();

  // "hoje"
  if (textoLower.includes('hoje')) return hoje;

  // "amanhã" / "amanha"
  if (textoLower.includes('amanh')) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // Days of week
  const diasSemana: Record<string, number> = {
    'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2, 'quarta': 3,
    'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6,
  };
  for (const [nome, dow] of Object.entries(diasSemana)) {
    if (textoLower.includes(nome)) {
      const d = new Date(hoje);
      let diff = dow - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  // "dia X" or just a number 1-31
  const diaMatch = textoLower.match(/dia\s*(\d{1,2})/);
  if (diaMatch) {
    const dia = parseInt(diaMatch[1]);
    if (dia >= 1 && dia <= 31) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
      if (d < hoje) d.setMonth(d.getMonth() + 1);
      return d;
    }
  }

  // DD/MM or DD/MM/YYYY
  const dataMatch = textoLower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dataMatch) {
    const dia = parseInt(dataMatch[1]);
    const mes = parseInt(dataMatch[2]) - 1;
    const ano = dataMatch[3] ? (dataMatch[3].length === 2 ? 2000 + parseInt(dataMatch[3]) : parseInt(dataMatch[3])) : hoje.getFullYear();
    const d = new Date(ano, mes, dia);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function diffDias(a: Date, b: Date): number {
  const msPerDay = 86400000;
  const aStart = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bStart = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bStart.getTime() - aStart.getTime()) / msPerDay);
}

function formatDataBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function addToHistorico(dados: any, role: string, content: string): any {
  const historico = dados?.mensagens_historico || [];
  historico.push({ role, content, ts: new Date().toISOString() });
  return { ...dados, mensagens_historico: historico.slice(-20) };
}

function getCredorNome(credorSlug: string): string {
  if (!credorSlug) return 'a empresa credora';
  if (credorSlug.includes('novo_mundo') || credorSlug.includes('ume')) return 'a Loja Novo Mundo';
  return credorSlug.replace(/_/g, ' ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'invalid json' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // ⚠ COST CONTROL (post-parse, precise): block groups/broadcasts/noise without
    // false-positives on legitimate DMs whose metadata may mention '@g.us'.
    const blockCheck = isBlockedParsedPayload(payload);
    if (blockCheck.blocked) {
      console.log(`[CHATBOT] Ignored: ${blockCheck.reason}`);
      return new Response(JSON.stringify({ success: true, ignored: blockCheck.reason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 🔬 DEBUG: log full raw payload for any non-group webhook so we can see
    // exactly what UAZAPI is sending for legitimate DMs (helps diagnose silent drops).
    const _dmFrom = payload?.chatid || payload?.remoteJid || payload?.from || payload?.message?.key?.remoteJid || payload?.message?.chatid || payload?.chat?.wa_chatid || 'unknown';
    const _dmFromMe = payload?.message?.fromMe ?? payload?.fromMe ?? payload?.key?.fromMe ?? false;
    const _dmType = payload?.message?.messageType || payload?.messageType || payload?.type || 'unknown';
    console.log(`[CHATBOT-DM] from=${_dmFrom} fromMe=${_dmFromMe} type=${_dmType}`);
    console.log('[CHATBOT-DM] raw:', JSON.stringify(payload).substring(0, 800));

    // --- VOICE CALL EVENT HANDLING ---
    const eventType = payload?.event || payload?.type || payload?.action || '';
    const callStatus = payload?.call?.status || payload?.status || payload?.call_status || '';
    const isCallEvent = eventType === 'call' || callStatus === 'answered' || callStatus === 'missed' || callStatus === 'rejected' || callStatus === 'ringing';

    if (isCallEvent && (callStatus === 'answered' || callStatus === 'missed' || callStatus === 'rejected')) {
      console.log(`[VOICE-CALL] Call event detected: status=${callStatus}`);
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseCall = createClient(supabaseUrl, supabaseServiceKey);

      const callPhone = (payload?.call?.from || payload?.call?.number || payload?.from || payload?.number || '').replace(/\D/g, '');
      const callId = payload?.call?.id || payload?.call_id || payload?.callId || '';

      // Try to find the contact in voice_campaign_contacts
      let contact = null;
      if (callId) {
        const { data } = await supabaseCall
          .from('voice_campaign_contacts')
          .select('*, voice_campaigns:campaign_id(audio_url)')
          .eq('call_id', callId)
          .eq('status', 'chamando')
          .maybeSingle();
        contact = data;
      }
      if (!contact && callPhone) {
        // Fallback: match by phone number
        const phoneVariants = [callPhone, callPhone.replace(/^55/, ''), `55${callPhone.replace(/^55/, '')}`];
        for (const phone of phoneVariants) {
          const { data } = await supabaseCall
            .from('voice_campaign_contacts')
            .select('*, voice_campaigns:campaign_id(audio_url)')
            .eq('status', 'chamando')
            .or(`telefone.eq.${phone}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) { contact = data; break; }
        }
      }

      if (contact) {
        if (callStatus === 'answered') {
          console.log(`[VOICE-CALL] Call answered for contact ${contact.id}, playing audio...`);
          
          // Get the audio URL from the campaign
          const audioUrl = (contact as any).voice_campaigns?.audio_url;
          const contactCallId = contact.call_id || callId;

          if (audioUrl) {
            // Get server_url and instance_token from the campaign contact's instance
            // We need to find which instance was used - look up from the campaign
            const { data: campaignData } = await supabaseCall
              .from('voice_campaigns')
              .select('user_id')
              .eq('id', contact.campaign_id)
              .single();

            if (campaignData) {
              const { data: instanceData } = await supabaseCall
                .from('user_whatsapp_instances')
                .select('server_url, instance_token')
                .eq('user_id', campaignData.user_id)
                .eq('ativo', true)
                .limit(1)
                .maybeSingle();

              if (instanceData) {
                const cleanUrl = instanceData.server_url.replace(/\/+$/, '');
                // NOTE: /call/play-audio is an ASSUMED endpoint. Verify with UAZAPI docs.
                const playEndpoints = [
                  { url: `${cleanUrl}/call/play-audio`, body: { call_id: contactCallId, audio: audioUrl } },
                  { url: `${cleanUrl}/call/play`, body: { call_id: contactCallId, url: audioUrl } },
                  { url: `${cleanUrl}/call/audio`, body: { call_id: contactCallId, file: audioUrl } },
                ];

                for (const ep of playEndpoints) {
                  try {
                    console.log(`[VOICE-CALL] Trying to play audio via ${ep.url}`);
                    const res = await fetch(ep.url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'token': instanceData.instance_token },
                      body: JSON.stringify(ep.body),
                    });
                    const resText = await res.text();
                    console.log(`[VOICE-CALL] Play audio response: ${res.status} - ${resText}`);
                    if (res.ok) break;
                  } catch (e) {
                    console.log(`[VOICE-CALL] Play endpoint failed: ${ep.url}`, e);
                  }
                }
              }
            }
          }

          await supabaseCall
            .from('voice_campaign_contacts')
            .update({ status: 'atendido', answered_at: new Date().toISOString() })
            .eq('id', contact.id);
        } else {
          // missed or rejected
          const newStatus = callStatus === 'missed' ? 'não atendeu' : 'rejeitado';
          await supabaseCall
            .from('voice_campaign_contacts')
            .update({ status: newStatus })
            .eq('id', contact.id);
        }

        // Update campaign counters
        const { data: stats } = await supabaseCall
          .from('voice_campaign_contacts')
          .select('status')
          .eq('campaign_id', contact.campaign_id);
        if (stats) {
          const sent = stats.filter(s => s.status === 'atendido' || s.status === 'enviado').length;
          const errors = stats.filter(s => ['erro', 'não atendeu', 'rejeitado'].includes(s.status)).length;
          await supabaseCall
            .from('voice_campaigns')
            .update({ total_sent: sent, total_errors: errors })
            .eq('id', contact.campaign_id);
        }

        console.log(`[VOICE-CALL] Contact ${contact.id} updated to status: ${callStatus}`);
      } else {
        console.log(`[VOICE-CALL] No matching campaign contact found for call event (phone: ${callPhone}, callId: ${callId})`);
      }

      return new Response(JSON.stringify({ success: true, handled: 'call_event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // --- END VOICE CALL EVENT HANDLING ---

    // --- Filtros rápidos (ANTES de qualquer DB call para economizar) ---
    const remoteJid = payload?.message?.chatid || payload?.chat?.wa_chatid || payload?.message?.sender_pn || payload?.key?.remoteJid || payload?.from || '';
    const isGroup = Boolean(payload?.message?.isGroup ?? payload?.chat?.wa_isGroup ?? isBlockedRemoteJid(remoteJid));
    const isBlockedChat = isBlockedRemoteJid(remoteJid);
    const uazapiMsgType = (payload?.message?.messageType || '').toLowerCase();

    // --- LOG DE ENTRADA (antes de bloqueios DM) ---
    const _msgText = payload?.message?.text || payload?.message?.content || payload?.text || '';
    console.log(`[CHATBOT] IN from=${remoteJid} isGroup=${isGroup} type=${uazapiMsgType} textLen=${_msgText.length} fromMe=${payload?.message?.fromMe ?? payload?.fromMe ?? false}`);

    if (isGroup || isBlockedChat || uazapiMsgType === 'reactionmessage' || uazapiMsgType === 'protocolmessage') {
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- AUDITORIA: registrar webhook_in para mensagens vindas de chips do sistema (fire-and-forget) ---
    // Detecção: o "owner" do webhook é uma instância nossa; se o "from" também for uma instância nossa,
    // estamos diante de ping-pong de aquecimento. Faz lookup async sem bloquear o fluxo.
    (async () => {
      try {
        const fromPhone = String(remoteJid || '').replace(/\D/g, '');
        if (!fromPhone) return;
        const fromSuffix = fromPhone.slice(-8);
        const ownerToken = payload?.token || payload?.instance_token || '';
        const sbAud = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        // Procura instância destino (owner do webhook, via token) e instância origem (via sufixo do telefone)
        const { data: instances } = await sbAud
          .from('user_whatsapp_instances')
          .select('id, nome, instance_token')
          .eq('ativo', true);
        if (!instances?.length) return;
        const destInst = instances.find((i: any) => i.instance_token === ownerToken);
        const origInst = instances.find((i: any) => {
          const p = (i.nome || '').match(/\d+/)?.[0] || '';
          return p && p.slice(-8) === fromSuffix;
        });
        // Só auditamos se origem é uma instância nossa (= ping-pong de aquecimento)
        if (!origInst) return;
        await sbAud.from('whatsapp_conversas_auditoria').insert({
          etapa: 'webhook_in',
          status: 'ok',
          instancia_origem_id: origInst.id,
          instancia_destino_id: destInst?.id || null,
          numero_origem: fromPhone,
          mensagem_original: String(_msgText).substring(0, 500),
          motivo: `chatbot_received owner=${destInst?.nome || 'unknown'}`,
        });
      } catch (_e) { /* silencioso */ }
    })();

    // --- Deduplicação ---
    const rawMessageId = payload?.message?.messageid || payload?.message?.id || payload?.key?.id || payload?.messageId || '';
    const messageId = rawMessageId.includes(':') ? rawMessageId.split(':').pop()! : rawMessageId;
    console.log(`[MEDIA-ID] messageid=${payload?.message?.messageid} message.id=${payload?.message?.id} key.id=${payload?.key?.id} -> cleaned=${messageId}`);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (messageId) {
      const { data: existente } = await supabase
        .from('chatbot_conversas')
        .select('dados')
        .eq('telefone', '__dedup_' + messageId)
        .maybeSingle();
      if (existente) {
        console.log(`[DEDUP] ${messageId} já processada.`);
        return new Response(JSON.stringify({ success: true, ignored: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('chatbot_conversas').upsert({
        telefone: '__dedup_' + messageId, etapa: 'dedup',
        dados: { processed_at: new Date().toISOString() },
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'telefone' });
    }

    // --- Filtros básicos ---
    const isFromMe = payload?.message?.fromMe ?? payload?.fromMe ?? payload?.key?.fromMe ?? false;

    // --- INBOX: Salvar mensagem no histórico ---
    const inboxTelefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
    const inboxTexto = extractTextFromPayload(payload);
    const inboxNomeContato = payload?.message?.senderName || payload?.pushName || payload?.senderName || payload?.message?.pushName || null;
    const inboxServerUrl = payload?.BaseUrl?.replace(/\/+$/, '') || '';
    const inboxInstanceToken = payload?.token || '';

    // --- MEDIA DETECTION ---
    let inboxTipoConteudo = 'texto';
    let inboxMediaUrl: string | null = null;
    let inboxMediaFallback = '';

    // UAZAPI fields
    const uazapiMessageType = (payload?.message?.messageType || '').toLowerCase(); // e.g. "audiomessage", "imagemessage"
    const uazapiMediaType = (payload?.message?.mediaType || '').toLowerCase(); // e.g. "audio", "image"
    const uazapiContentUrl = payload?.message?.content?.URL || null;
    const uazapiMimetype = payload?.message?.content?.mimetype || '';

    // Legacy/alternative fields
    const msgType = payload?.message?.type || '';
    const audioMsg = payload?.message?.audioMessage;
    const imageMsg = payload?.message?.imageMessage;
    const documentMsg = payload?.message?.documentMessage;
    const videoMsg = payload?.message?.videoMessage;

    const isAudio = audioMsg || msgType === 'audio' || msgType === 'ptt' || uazapiMessageType.includes('audio') || uazapiMediaType === 'audio' || uazapiMimetype.startsWith('audio/');
    const isImage = imageMsg || msgType === 'image' || uazapiMessageType.includes('image') || uazapiMediaType === 'image' || uazapiMimetype.startsWith('image/');
    const isDocument = documentMsg || msgType === 'document' || uazapiMessageType.includes('document') || uazapiMediaType === 'document' || uazapiMimetype === 'application/pdf';
    const isVideo = videoMsg || msgType === 'video' || uazapiMessageType.includes('video') || uazapiMediaType === 'video' || uazapiMimetype.startsWith('video/');
    const isSticker = uazapiMessageType.includes('sticker') || uazapiMediaType === 'sticker';

    if (isAudio) {
      inboxTipoConteudo = 'audio';
      inboxMediaUrl = audioMsg?.url || uazapiContentUrl || payload?.message?.media_url || payload?.message?.mediaUrl || null;
      inboxMediaFallback = '🎤 Áudio';
    } else if (isImage && !isSticker) {
      inboxTipoConteudo = 'imagem';
      inboxMediaUrl = imageMsg?.url || uazapiContentUrl || payload?.message?.media_url || payload?.message?.mediaUrl || null;
      inboxMediaFallback = '📷 Imagem';
    } else if (isDocument) {
      inboxTipoConteudo = 'documento';
      inboxMediaUrl = documentMsg?.url || uazapiContentUrl || payload?.message?.media_url || payload?.message?.mediaUrl || null;
      inboxMediaFallback = '📄 Documento';
    } else if (isVideo) {
      inboxTipoConteudo = 'imagem';
      inboxMediaUrl = videoMsg?.url || uazapiContentUrl || payload?.message?.media_url || payload?.message?.mediaUrl || null;
      inboxMediaFallback = '🎬 Vídeo';
    } else if (uazapiContentUrl && msgType === 'media') {
      // Generic media fallback - detect by mimetype
      if (uazapiMimetype.startsWith('audio/')) { inboxTipoConteudo = 'audio'; inboxMediaFallback = '🎤 Áudio'; }
      else if (uazapiMimetype.startsWith('image/')) { inboxTipoConteudo = 'imagem'; inboxMediaFallback = '📷 Imagem'; }
      else if (uazapiMimetype.startsWith('video/')) { inboxTipoConteudo = 'imagem'; inboxMediaFallback = '🎬 Vídeo'; }
      else { inboxTipoConteudo = 'documento'; inboxMediaFallback = '📄 Arquivo'; }
      inboxMediaUrl = uazapiContentUrl;
    }

    // Also check top-level media_url
    if (!inboxMediaUrl && payload?.message?.media_url) {
      inboxMediaUrl = payload.message.media_url;
    }
    if (!inboxMediaUrl && payload?.message?.mediaUrl) {
      inboxMediaUrl = payload.message.mediaUrl;
    }

    console.log(`[INBOX-MEDIA] messageType=${uazapiMessageType} mediaType=${uazapiMediaType} contentUrl=${!!uazapiContentUrl} mimetype=${uazapiMimetype} -> tipo=${inboxTipoConteudo} mediaUrl=${!!inboxMediaUrl}`);

    const inboxConteudo = inboxTexto || inboxMediaFallback;

    // Download media to inbox-media bucket for permanent URL
    // IMPORTANT: content.URL from UAZAPI is WhatsApp's encrypted CDN URL.
    // We must use UAZAPI's /download-media endpoint to get the decrypted file.
    let inboxPermanentMediaUrl: string | null = null;
    if (inboxMediaUrl && inboxTipoConteudo !== 'texto') {
      try {
        let mediaBlob: Blob | null = null;
        let downloadSuccess = false;
        let downloadStrategy: 'uazapi-json' | 'uazapi-binary' | 'direct-fetch' | 'local-decrypt' | 'thumbnail' | null = null;

        // Extract all media metadata from payload
        const mediaMeta = extractMediaMetadata(payload);
        console.log(`[MEDIA] Metadados extraídos: fileLength=${mediaMeta.fileLength}, width=${mediaMeta.width}, height=${mediaMeta.height}, mediaKey=${!!mediaMeta.mediaKey}, encUrl=${!!mediaMeta.encUrl}, mime=${mediaMeta.mimetype}`);

        const expectedFileLength = mediaMeta.fileLength;

        // Helper: check if a blob is high-quality enough to be the original
        async function isOriginalQuality(blob: Blob, strategy: string): Promise<boolean> {
          if (inboxTipoConteudo !== 'imagem') return blob.size > 100;
          
          const tiny = await isTinyImageBlob(blob);
          if (tiny) {
            console.warn(`[MEDIA-QUALITY] ${strategy}: blob rejeitado como thumbnail (size=${blob.size})`);
            return false;
          }
          
          // If we know expected size, reject if blob is much smaller (likely preview)
          if (expectedFileLength > 0 && blob.size < expectedFileLength * 0.3) {
            console.warn(`[MEDIA-QUALITY] ${strategy}: blob muito menor que esperado (${blob.size} vs ${expectedFileLength})`);
            return false;
          }
          
          return true;
        }

        // Strategy 1: Use UAZAPI endpoints to download decrypted media
        if (messageId && inboxServerUrl && inboxInstanceToken) {
          await new Promise(r => setTimeout(r, 2000));

          const cleanUrl = inboxServerUrl.replace(/\/+$/, '');
          const uazapiAttempts = [
            { url: `${cleanUrl}/chat/downloadMedia`, method: 'POST', body: { messageId: rawMessageId } },
            { url: `${cleanUrl}/chat/downloadMedia`, method: 'POST', body: { messageId: messageId } },
            { url: `${cleanUrl}/download-media`, method: 'POST', body: { messageId: rawMessageId } },
            { url: `${cleanUrl}/download-media`, method: 'POST', body: { messageId: messageId } },
            { url: `${cleanUrl}/chat/getMessageById`, method: 'POST', body: { messageId: rawMessageId, download: true } },
          ];

          // Try with both header styles: 'token' and 'Authorization: Bearer'
          const headerStyles = [
            { 'Content-Type': 'application/json', 'token': inboxInstanceToken },
            { 'Content-Type': 'application/json', 'Authorization': `Bearer ${inboxInstanceToken}` },
          ];

          for (const attempt of uazapiAttempts) {
            if (downloadSuccess) break;
            for (const headers of headerStyles) {
              if (downloadSuccess) break;
              try {
                const headerMode = 'token' in headers ? 'token-header' : 'bearer-header';
                console.log(`[INBOX] Tentando UAZAPI: ${attempt.method} ${attempt.url} [${headerMode}] body=${JSON.stringify(attempt.body)}`);
                const uazapiResp = await fetch(attempt.url, {
                  method: attempt.method,
                  headers,
                  body: JSON.stringify(attempt.body),
                });
                const respContentType = uazapiResp.headers.get('content-type') || '';
                console.log(`[INBOX] UAZAPI resposta: HTTP ${uazapiResp.status} CT=${respContentType} [${headerMode}]`);
                
                if (!uazapiResp.ok) {
                  await uazapiResp.text(); // consume body
                  continue;
                }

                if (respContentType.includes('application/json')) {
                  const jsonResp = await uazapiResp.json();
                  const b64Data = jsonResp?.base64 || jsonResp?.data || jsonResp?.message?.base64 || jsonResp?.message?.data;
                  const mediaUrlFromJson = jsonResp?.url || jsonResp?.mediaUrl || jsonResp?.message?.url || jsonResp?.message?.mediaUrl || jsonResp?.data?.url;
                  
                  if (b64Data && typeof b64Data === 'string' && b64Data.length > 100) {
                    const binaryStr = atob(b64Data.replace(/^data:[^;]+;base64,/, ''));
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                    const mime = jsonResp.mimetype || jsonResp.message?.mimetype || uazapiMimetype || 'application/octet-stream';
                    const candidateBlob = new Blob([bytes], { type: mime });
                    
                    if (await isOriginalQuality(candidateBlob, 'uazapi-json')) {
                      mediaBlob = candidateBlob;
                      downloadSuccess = true;
                      downloadStrategy = 'uazapi-json';
                      console.log(`[INBOX] ✅ Download via UAZAPI JSON ok, size=${mediaBlob.size}, mime=${mime}`);
                    }
                  } else if (mediaUrlFromJson && typeof mediaUrlFromJson === 'string' && mediaUrlFromJson.startsWith('http')) {
                    console.log(`[INBOX] UAZAPI retornou URL de mídia: ${mediaUrlFromJson}`);
                    const mediaFetchResp = await fetch(mediaUrlFromJson);
                    if (mediaFetchResp.ok) {
                      const candidateBlob = await mediaFetchResp.blob();
                      if (await isOriginalQuality(candidateBlob, 'uazapi-url')) {
                        mediaBlob = candidateBlob;
                        downloadSuccess = true;
                        downloadStrategy = 'uazapi-json';
                        console.log(`[INBOX] ✅ Download via URL UAZAPI ok, size=${mediaBlob.size}`);
                      }
                    } else {
                      await mediaFetchResp.text();
                    }
                  } else {
                    console.log(`[INBOX] UAZAPI JSON sem base64/url válida, keys=${Object.keys(jsonResp).join(',')}`);
                  }
                } else if (respContentType.startsWith('image/') || respContentType.startsWith('audio/') || respContentType.startsWith('video/') || respContentType === 'application/octet-stream') {
                  const candidateBlob = await uazapiResp.blob();
                  if (await isOriginalQuality(candidateBlob, 'uazapi-binary')) {
                    mediaBlob = candidateBlob;
                    downloadSuccess = true;
                    downloadStrategy = 'uazapi-binary';
                    console.log(`[INBOX] ✅ Download via UAZAPI binary ok, size=${mediaBlob.size}, type=${mediaBlob.type}`);
                  }
                } else {
                  await uazapiResp.text();
                }
              } catch (uazErr) {
                console.log(`[INBOX] UAZAPI tentativa falhou: ${uazErr}`);
              }
            }
          }
        }

        // Strategy 2: Direct fetch (works for already-public URLs)
        if (!downloadSuccess && inboxMediaUrl) {
          try {
            const mediaResp = await fetch(inboxMediaUrl);
            if (mediaResp.ok) {
              const blob = await mediaResp.blob();
              const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
              const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
              const isPng = header[0] === 0x89 && header[1] === 0x50;
              const isWebp = header[0] === 0x52 && header[1] === 0x49;
              const isOgg = header[0] === 0x4F && header[1] === 0x67;
              const isPdf = header[0] === 0x25 && header[1] === 0x50;
              const isMp4 = header.length >= 4 && header[3] === 0x66;
              const isMp3 = header[0] === 0xFF && (header[1] & 0xE0) === 0xE0;
              const isM4a = isMp4;
              const isValidMedia = isJpeg || isPng || isWebp || isOgg || isPdf || isMp4 || isMp3 || isM4a || (blob.type && blob.type !== 'application/octet-stream');

              if (isValidMedia && await isOriginalQuality(blob, 'direct-fetch')) {
                mediaBlob = blob;
                downloadSuccess = true;
                downloadStrategy = 'direct-fetch';
                console.log(`[INBOX] ✅ Download direto ok, size=${blob.size}, type=${blob.type}`);
              } else if (!isValidMedia) {
                console.warn(`[INBOX] Download direto retornou dados não-mídia (possivelmente criptografados), header=[${Array.from(header).map(b => b.toString(16)).join(',')}]`);
              }
            } else {
              console.error(`[INBOX] Falha download mídia: HTTP ${mediaResp.status}`);
              await mediaResp.text();
            }
          } catch (directErr) {
            console.log(`[INBOX] Direct fetch falhou: ${directErr}`);
          }
        }

        // Strategy 3: Local decryption of .enc file using mediaKey
        if (!downloadSuccess && mediaMeta.mediaKey && mediaMeta.encUrl) {
          console.log(`[MEDIA] Tentando descriptografia local do .enc...`);
          try {
            const decryptedBlob = await decryptWhatsAppMedia(
              mediaMeta.encUrl,
              mediaMeta.mediaKey,
              inboxTipoConteudo,
              mediaMeta.mimetype || (inboxTipoConteudo === 'imagem' ? 'image/jpeg' : inboxTipoConteudo === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
            );
            if (decryptedBlob && decryptedBlob.size > 100) {
              if (await isOriginalQuality(decryptedBlob, 'local-decrypt')) {
                mediaBlob = decryptedBlob;
                downloadSuccess = true;
                downloadStrategy = 'local-decrypt';
                console.log(`[MEDIA] ✅ Descriptografia local OK! size=${decryptedBlob.size} bytes`);
              } else {
                console.warn(`[MEDIA] Descriptografia local retornou blob de baixa qualidade (size=${decryptedBlob.size})`);
              }
            }
          } catch (decryptErr) {
            console.error(`[MEDIA] Falha na descriptografia local:`, decryptErr);
          }
        } else if (!downloadSuccess && !mediaMeta.mediaKey) {
          console.log(`[MEDIA] Sem mediaKey no payload — descriptografia local indisponível`);
        }

        // Strategy 4: JPEGThumbnail as LAST RESORT ONLY
        if (!downloadSuccess && inboxTipoConteudo === 'imagem') {
          const thumbnail = payload?.message?.content?.JPEGThumbnail
            || payload?.message?.imageMessage?.jpegThumbnail
            || payload?.message?.content?.jpegThumbnail;
          if (thumbnail && typeof thumbnail === 'string' && thumbnail.length > 50) {
            try {
              const b64Clean = thumbnail.replace(/^data:[^;]+;base64,/, '');
              const binaryStr = atob(b64Clean);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              mediaBlob = new Blob([bytes], { type: 'image/jpeg' });
              downloadSuccess = true;
              downloadStrategy = 'thumbnail';
              console.warn(`[INBOX] ⚠️ Usando JPEGThumbnail como ÚLTIMO RECURSO, size=${mediaBlob.size} — imagem será de baixa qualidade`);
            } catch (thumbErr) {
              console.warn(`[INBOX] Falha ao decodificar JPEGThumbnail: ${thumbErr}`);
            }
          }
        }

        // Upload the final blob to storage
        if (downloadSuccess && mediaBlob && mediaBlob.size > 0) {
          console.log(`[MEDIA-RESULT] Estratégia vencedora: ${downloadStrategy}, tamanho final: ${mediaBlob.size} bytes`);
          
          const mimeToExt: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
          const detectedMime = downloadStrategy === 'thumbnail'
            ? 'image/jpeg'
            : uazapiMimetype || (mediaBlob.type !== 'application/octet-stream' ? mediaBlob.type : '') || '';
          const correctMimeType = detectedMime || 
            (inboxTipoConteudo === 'audio' ? 'audio/ogg' : 
             inboxTipoConteudo === 'imagem' ? 'image/jpeg' : 
             inboxTipoConteudo === 'documento' ? 'application/pdf' :
             'application/octet-stream');
          const ext = mimeToExt[correctMimeType] || mimeToExt[detectedMime] || (inboxTipoConteudo === 'audio' ? 'ogg' : inboxTipoConteudo === 'imagem' ? 'jpg' : inboxTipoConteudo === 'documento' ? 'pdf' : 'bin');
          const storagePath = `${inboxTelefone}/${Date.now()}.${ext}`;
          
          const uploadBlob = new Blob([mediaBlob], { type: correctMimeType });
          
          const { error: upErr } = await supabase.storage
            .from('inbox-media')
            .upload(storagePath, uploadBlob, { contentType: correctMimeType, upsert: false });
          if (!upErr) {
            const { data: pubData } = supabase.storage.from('inbox-media').getPublicUrl(storagePath);
            inboxPermanentMediaUrl = pubData?.publicUrl || null;
            console.log(`[INBOX] ✅ Mídia salva no storage: ${storagePath} (${correctMimeType}) via ${downloadStrategy}`);
          } else {
            console.error('[INBOX] Erro upload mídia:', upErr);
          }
        }

        if (!inboxPermanentMediaUrl && !downloadSuccess) {
          console.warn('[INBOX] ❌ Nenhuma estratégia de download funcionou. messageId=' + messageId + ' mediaUrl=' + inboxMediaUrl);
        }
      } catch (dlErr) {
        console.error('[INBOX] Erro geral download mídia:', dlErr);
      }
    }

    const finalMediaUrl = inboxPermanentMediaUrl;

    let instanciaId: string | null = null;
    if (inboxTelefone && (inboxTexto || inboxMediaUrl)) {
      try {
        // Find the instance by matching token
        if (inboxInstanceToken) {
          const { data: instancia } = await supabase
            .from('user_whatsapp_instances')
            .select('id')
            .eq('instance_token', inboxInstanceToken)
            .eq('ativo', true)
            .limit(1)
            .maybeSingle();
          instanciaId = instancia?.id || null;
        }

        if (instanciaId) {
          const agora = new Date().toISOString();

          // Suffix matching: find existing contact by last 8 digits to unify phone formats
          const phoneSuffix = inboxTelefone.replace(/\D/g, '').slice(-8);
          const { data: matchedContact } = await supabase
            .from('whatsapp_contatos')
            .select('id, telefone, nao_lido')
            .eq('instancia_id', instanciaId)
            .like('telefone', `%${phoneSuffix}`)
            .maybeSingle();

          // Use the contact's stored phone format if found, otherwise use webhook phone
          const telefoneParaSalvar = matchedContact?.telefone || inboxTelefone;

          if (isFromMe) {
            // For fromMe: check if send-whatsapp already saved this message (dedup within 30s)
            const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
            const { data: existing } = await supabase
              .from('whatsapp_mensagens')
              .select('id')
              .eq('instancia_id', instanciaId)
              .like('telefone_remoto', `%${phoneSuffix}`)
              .eq('direcao', 'saida')
              .gte('timestamp_msg', thirtySecsAgo)
              .limit(1)
              .maybeSingle();

            if (existing) {
              console.log(`[INBOX] fromMe duplicado (já salvo por send-whatsapp): ${telefoneParaSalvar}`);
            } else {
              // Manual send from WhatsApp app — save it
              await supabase.from('whatsapp_mensagens').insert({
                instancia_id: instanciaId,
                telefone_remoto: telefoneParaSalvar,
                nome_contato: inboxNomeContato,
                conteudo: inboxConteudo,
                direcao: 'saida',
                timestamp_msg: agora,
                lida: true,
                tipo_conteudo: inboxTipoConteudo,
                media_url: finalMediaUrl,
                whatsapp_msg_id: rawMessageId || null,
              });
              console.log(`[INBOX] Mensagem manual (fromMe) salva: ${telefoneParaSalvar} tipo=${inboxTipoConteudo}`);

              // Update or create contact for manual fromMe
              if (matchedContact) {
                await supabase.from('whatsapp_contatos').update({
                  ultima_mensagem: inboxConteudo.slice(0, 200),
                  ultima_mensagem_em: agora,
                }).eq('id', matchedContact.id);
              } else {
                await supabase.from('whatsapp_contatos').insert({
                  instancia_id: instanciaId,
                  telefone: telefoneParaSalvar,
                  nome: inboxNomeContato,
                  ultima_mensagem: inboxConteudo.slice(0, 200),
                  ultima_mensagem_em: agora,
                  nao_lido: 0,
                });
              }
            }
          } else {
            // Incoming message — always save
            await supabase.from('whatsapp_mensagens').insert({
              instancia_id: instanciaId,
              telefone_remoto: telefoneParaSalvar,
              nome_contato: inboxNomeContato,
              conteudo: inboxConteudo,
              direcao: 'entrada',
              timestamp_msg: agora,
              lida: false,
              tipo_conteudo: inboxTipoConteudo,
              media_url: finalMediaUrl,
              whatsapp_msg_id: rawMessageId || null,
            });

            if (matchedContact) {
              await supabase.from('whatsapp_contatos').update({
                nome: inboxNomeContato || undefined,
                ultima_mensagem: inboxConteudo.slice(0, 200),
                ultima_mensagem_em: agora,
                nao_lido: (matchedContact.nao_lido || 0) + 1,
              }).eq('id', matchedContact.id);
            } else {
              await supabase.from('whatsapp_contatos').insert({
                instancia_id: instanciaId,
                telefone: telefoneParaSalvar,
                nome: inboxNomeContato,
                ultima_mensagem: inboxConteudo.slice(0, 200),
                ultima_mensagem_em: agora,
                nao_lido: 1,
              });
            }

            // Fire-and-forget: salvar contato na agenda física do dispositivo
            if (!matchedContact && inboxNomeContato && inboxServerUrl && inboxInstanceToken) {
              salvarContatoUAZAPI(inboxServerUrl, inboxInstanceToken, inboxTelefone, inboxNomeContato)
                .catch(err => console.error('[CONTATO-AGENDA] Erro fire-and-forget:', err));
            }

            console.log(`[INBOX] Mensagem entrada salva: ${telefoneParaSalvar} tipo=${inboxTipoConteudo} (instancia: ${instanciaId})`);
          }
        }
      } catch (inboxErr) {
        console.error('[INBOX] Erro ao salvar mensagem:', inboxErr);
      }
    }

    // --- AQUECIMENTO: Detectar respostas de aquecimento ---
    if (!isFromMe && inboxTelefone) {
      try {
        // Robust phone matching: extract last 8 digits to compare
        // This handles all variations: with/without 55 prefix, with/without 9th digit
        const webhookLast8 = inboxTelefone.replace(/\D/g, '').slice(-8);
        console.log(`[AQUECIMENTO] Verificando se ${inboxTelefone} (last8: ${webhookLast8}) é instância interna...`);

        // Fetch all active instances and match by extracting phone from nome
        const { data: allInstances } = await supabase
          .from('user_whatsapp_instances')
          .select('id, nome')
          .eq('ativo', true);

        let senderInstance: { id: string } | null = null;
        if (allInstances) {
          for (const inst of allInstances) {
            const phoneFromName = (inst.nome || '').match(/^(\d+)/)?.[1] || '';
            const instLast8 = phoneFromName.slice(-8);
            if (instLast8.length >= 8 && instLast8 === webhookLast8) {
              senderInstance = { id: inst.id };
              console.log(`[AQUECIMENTO] ✅ Match encontrado: ${inst.nome} (phone: ${phoneFromName}, last8: ${instLast8})`);
              break;
            }
          }
          if (!senderInstance) {
            console.log(`[AQUECIMENTO] Nenhuma instância interna encontrou match para ${inboxTelefone}`);
          }
        }

        // Detect warming interaction: senderInstance sent a message TO instanciaId (this webhook's instance)
        // The warming function records: instancia_origem_id = sender, instancia_destino_id = receiver
        // When receiver gets the message, webhook fires on instanciaId. The phone that sent = senderInstance.
        // So we need: instancia_origem_id = senderInstance.id AND instancia_destino_id = instanciaId
        if (senderInstance && instanciaId) {
          const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
          const { data: warmingInteraction } = await supabase
            .from('whatsapp_aquecimento_interacoes')
            .select('id, instancia_origem_id, enviado_em')
            .eq('instancia_origem_id', senderInstance.id)
            .eq('instancia_destino_id', instanciaId)
            .eq('status', 'ENVIADO')
            .gte('enviado_em', twoHoursAgo)
            .order('enviado_em', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (warmingInteraction) {
            const agora = new Date();
            const enviadoEm = new Date(warmingInteraction.enviado_em);
            const tempoRespostaSeg = Math.round((agora.getTime() - enviadoEm.getTime()) / 1000);

            // Update interaction to RESPONDIDO
            await supabase
              .from('whatsapp_aquecimento_interacoes')
              .update({
                status: 'RESPONDIDO',
                respondido_em: agora.toISOString(),
                tempo_resposta_segundos: tempoRespostaSeg,
                conteudo_resposta: inboxTexto?.slice(0, 500) || null,
              })
              .eq('id', warmingInteraction.id);

            // Increment respostas_recebidas on the ORIGIN instance (the one that sent)
            const { data: origemAquec } = await supabase
              .from('whatsapp_aquecimento_instancias')
              .select('id, respostas_recebidas')
              .eq('instancia_id', warmingInteraction.instancia_origem_id)
              .maybeSingle();

            if (origemAquec) {
              await supabase
                .from('whatsapp_aquecimento_instancias')
                .update({ respostas_recebidas: origemAquec.respostas_recebidas + 1 })
                .eq('id', origemAquec.id);
            }

            console.log(`[AQUECIMENTO] Resposta detectada de ${inboxTelefone}, interação ${warmingInteraction.id} marcada como RESPONDIDO (${tempoRespostaSeg}s)`);

            // --- IA CONVERSACIONAL: Gerar resposta automática via Ollama ---
            try {
              // Get the receiving instance's (instanciaId) aquecimento data for phase info
              const { data: recvAquec } = await supabase
                .from('whatsapp_aquecimento_instancias')
                .select('fase')
                .eq('instancia_id', instanciaId)
                .maybeSingle();

              const fase = recvAquec?.fase || 1;

              // Probabilidade de responder por fase
              const probMap: Record<number, number> = { 1: 0.30, 2: 0.60 };
              const probabilidade = probMap[fase] ?? 0.90;
              const rng = Math.random();

              if (rng <= probabilidade) {
                // Get the receiving instance's connection details to send reply
                const { data: recvInstance } = await supabase
                  .from('user_whatsapp_instances')
                  .select('server_url, instance_token')
                  .eq('id', instanciaId)
                  .single();

                if (recvInstance) {
                  // Call whatsapp-ia-responder edge function with delay and send params
                  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

                  // Delay aleatório de 15-90s para simular leitura humana
                  const delay = 15000 + Math.random() * 75000;
                  console.log(`[IA-AQUEC] Fase ${fase}, prob ${probabilidade}, rng ${rng.toFixed(2)} → RESPONDENDO em ${Math.round(delay/1000)}s`);

                  const iaPayload = {
                    action: 'gerar-resposta',
                    mensagem: inboxTexto || 'Olá',
                    fase,
                    instancia_origem_id: instanciaId, // the one that will reply
                    instancia_destino_id: senderInstance.id, // the one that sent this message
                    delay_ms: delay,
                    server_url: recvInstance.server_url,
                    instance_token: recvInstance.instance_token,
                    numero_destino: inboxTelefone,
                  };

                  // Call ia-responder - it will handle the delay and sending internally
                  try {
                    const iaResp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ia-responder`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                      },
                      body: JSON.stringify(iaPayload),
                    });

                    const iaData = await iaResp.json();
                    console.log(`[IA-AQUEC] Resposta da IA:`, JSON.stringify(iaData).substring(0, 200));
                  } catch (iaErr) {
                    console.error('[IA-AQUEC] Erro no fluxo de resposta IA:', iaErr);
                  }
                }
              } else {
                console.log(`[IA-AQUEC] Fase ${fase}, prob ${probabilidade}, rng ${rng.toFixed(2)} → NÃO respondendo`);
              }
            } catch (iaFlowErr) {
              console.error('[IA-AQUEC] Erro ao iniciar fluxo IA:', iaFlowErr);
            }

            return new Response(JSON.stringify({ success: true, aquecimento_response: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (aquecErr) {
        console.error('[AQUECIMENTO] Erro ao verificar resposta de aquecimento:', aquecErr);
      }
    }

    // --- INBOX-ONLY MODE: Não responder automaticamente ---
    // Mensagens de clientes (não-admin, não-fromMe) são apenas salvas no Inbox
    if (!isFromMe && !isAdminNumber(inboxTelefone)) {
      console.log(`[INBOX-ONLY] Mensagem de ${inboxTelefone} salva no Inbox. Chatbot desativado - sem resposta automática.`);
      return new Response(JSON.stringify({ success: true, inbox_only: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Track fromMe messages (outbound proposals) ---
    if (isFromMe) {
      const textoFromMe = extractTextFromPayload(payload);
      const textoFromMeLower = textoFromMe.toLowerCase();
      const destinoTelefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');

      // --- DESBLOQUEIO + ATENDIMENTO HUMANO ---
      if (destinoTelefone) {
        const supabaseUrlFm = Deno.env.get('SUPABASE_URL')!;
        const supabaseKeyFm = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseFm = createClient(supabaseUrlFm, supabaseKeyFm);

        const { data: convAguardando } = await supabaseFm
          .from('chatbot_conversas')
          .select('etapa, dados')
          .eq('telefone', destinoTelefone)
          .maybeSingle();

        if (convAguardando?.etapa === 'aguardando_humano') {
          const etapaAnterior = convAguardando.dados?.etapa_antes_humano || 'novo';
          console.log(`[UNLOCK] Admin respondeu para ${destinoTelefone}, desbloqueando de aguardando_humano -> ${etapaAnterior}`);
          const dadosDesbloq = { ...convAguardando.dados };
          delete dadosDesbloq.etapa_antes_humano;
          await supabaseFm.from('chatbot_conversas').upsert({
            telefone: destinoTelefone,
            etapa: etapaAnterior,
            dados: dadosDesbloq,
            atualizado_em: new Date().toISOString(),
          }, { onConflict: 'telefone' });
        }

        // --- ATENDIMENTO HUMANO: Qualquer mensagem manual pausa o bot por 30 min ---
        const etapaAtualConv = convAguardando?.etapa || 'novo';
        const dadosAtuais = convAguardando?.dados || {};
        // Só marca atendimento_humano se NÃO for proposta (proposta tem lógica própria abaixo)
        if (!textoFromMeLower.includes('50% de desconto') && !textoFromMeLower.includes('parcelas em aberto')) {
          console.log(`[HUMAN] Mensagem manual detectada para ${destinoTelefone}, pausando bot por 30min`);
          const etapaParaSalvar = etapaAtualConv === 'atendimento_humano' 
            ? 'atendimento_humano' 
            : 'atendimento_humano';
          const etapaAnteriorParaSalvar = etapaAtualConv === 'atendimento_humano'
            ? (dadosAtuais.etapa_antes_humano || 'novo')
            : etapaAtualConv;
          
          await supabaseFm.from('chatbot_conversas').upsert({
            telefone: destinoTelefone,
            etapa: 'atendimento_humano',
            dados: {
              ...dadosAtuais,
              atendimento_humano_em: new Date().toISOString(),
              etapa_antes_humano: etapaAnteriorParaSalvar,
            },
            atualizado_em: new Date().toISOString(),
          }, { onConflict: 'telefone' });
        }

        // --- Proposta detection (existing logic) ---
        if (textoFromMeLower.includes('50% de desconto') || textoFromMeLower.includes('parcelas em aberto')) {
          console.log(`[fromMe] Proposta detectada para ${destinoTelefone}, atualizando estado...`);

          const serverUrlFm = payload?.BaseUrl?.replace(/\/+$/, '') || Deno.env.get('UAZAPI_SERVER_URL');
          const instanceTokenFm = payload?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

          const phoneSuffix = destinoTelefone.slice(-10);
          const phoneSuffix11 = destinoTelefone.slice(-11);

          // Find debtor by phone
          let devedoresEncontrados: any[] = [];
          const { data: devPorTel } = await supabaseFm
            .from('devedores')
            .select('nome, cpf, telefone, valor_atualizado, credor')
            .eq('ativo', true)
            .or(`telefone.ilike.%${phoneSuffix},telefone.ilike.%${phoneSuffix11}`);
          devedoresEncontrados = devPorTel || [];

          if (devedoresEncontrados.length === 0) {
            const { data: telsAdicionais } = await supabaseFm
              .from('devedor_telefones')
              .select('devedor_cpf, numero')
              .eq('ativo', true)
              .or(`numero.ilike.%${phoneSuffix},numero.ilike.%${phoneSuffix11}`);
            if (telsAdicionais && telsAdicionais.length > 0) {
              const cpfsUnicos = [...new Set(telsAdicionais.map((t: any) => t.devedor_cpf))];
              const { data: devPorCpf } = await supabaseFm
                .from('devedores')
                .select('nome, cpf, telefone, valor_atualizado, credor')
                .eq('ativo', true)
                .in('cpf', cpfsUnicos);
              if (devPorCpf) devedoresEncontrados = devPorCpf;
            }
          }

          // Check if pre-hydrated data exists BEFORE deciding to use DB values
          const { data: existingPreHydrated } = await supabaseFm
            .from('chatbot_conversas')
            .select('dados')
            .eq('telefone', destinoTelefone)
            .maybeSingle();

          const preHydrated = existingPreHydrated?.dados;
          const hasPreHydration = preHydrated?.valor_total && preHydrated?.valor_avista;

          if (hasPreHydration) {
            console.log(`[fromMe] Pre-hydrated data found for ${destinoTelefone}: valor_total=${preHydrated.valor_total}, preserving spreadsheet values`);
            await supabaseFm.from('chatbot_conversas').upsert({
              telefone: destinoTelefone,
              etapa: 'proposta_enviada',
              dados: {
                ...preHydrated,
                mensagens_historico: [{ role: 'assistente', content: textoFromMe, ts: new Date().toISOString() }],
              },
              server_url: serverUrlFm, instance_token: instanceTokenFm,
              atualizado_em: new Date().toISOString(),
            }, { onConflict: 'telefone' });
            console.log(`[fromMe] Estado definido como proposta_enviada para ${destinoTelefone} (dados da planilha preservados)`);
          } else if (devedoresEncontrados.length > 0) {
            const devedor = devedoresEncontrados[0];
            const cpf = devedor.cpf.replace(/\D/g, '');
            const valorTotal = devedoresEncontrados
              .filter((d: any) => d.cpf.replace(/\D/g, '') === cpf)
              .reduce((sum: number, d: any) => sum + Number(d.valor_atualizado), 0);
            const valorAvista = valorTotal * 0.5;
            const valorParcelado = valorTotal * 0.7;
            let maxParcelas = Math.floor(valorParcelado / VALOR_MINIMO_PARCELA);
            if (maxParcelas > 24) maxParcelas = 24;
            if (maxParcelas < 2) maxParcelas = 2;
            const credorNome = getCredorNome(devedor.credor || '');

            await supabaseFm.from('chatbot_conversas').upsert({
              telefone: destinoTelefone,
              etapa: 'proposta_enviada',
              dados: {
                cpf, nome: devedor.nome, valor_total: valorTotal,
                valor_avista: valorAvista, valor_parcelado: valorParcelado,
                max_parcelas: maxParcelas, credor: credorNome,
                mensagens_historico: [{ role: 'assistente', content: textoFromMe, ts: new Date().toISOString() }],
              },
              server_url: serverUrlFm, instance_token: instanceTokenFm,
              atualizado_em: new Date().toISOString(),
            }, { onConflict: 'telefone' });
            console.log(`[fromMe] Estado definido como proposta_enviada para ${destinoTelefone} (CPF: ${cpf})`);
          } else {
            const { data: existingConv } = await supabaseFm
              .from('chatbot_conversas')
              .select('dados')
              .eq('telefone', destinoTelefone)
              .maybeSingle();

            const existingDados = existingConv?.dados || {};
            const newDados = {
              ...existingDados,
              mensagens_historico: [{ role: 'assistente', content: textoFromMe, ts: new Date().toISOString() }],
            };

            await supabaseFm.from('chatbot_conversas').upsert({
              telefone: destinoTelefone,
              etapa: 'proposta_enviada',
              dados: newDados,
              server_url: serverUrlFm, instance_token: instanceTokenFm,
              atualizado_em: new Date().toISOString(),
            }, { onConflict: 'telefone' });
            console.log(`[fromMe] Proposta detectada para ${destinoTelefone} (devedor não no banco) - estado resetado para proposta_enviada`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, ignored: true, tracked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
    let texto = extractTextFromPayload(payload);

    // Se não tem texto, verificar se é áudio e transcrever
    if (!texto) {
      const audioUrl = payload?.message?.mediaUrl 
        || payload?.message?.audioMessage?.url 
        || payload?.message?.audio?.url
        || payload?.mediaUrl
        || payload?.message?.audioMessage?.mediaUrl;

      if (audioUrl) {
        console.log(`Áudio detectado de ${telefone}, URL: ${audioUrl}`);
        try {
          texto = await transcreverAudio(audioUrl);
          console.log(`Transcrição do áudio de ${telefone}: "${texto}"`);
        } catch (err) {
          console.error(`Erro ao transcrever áudio de ${telefone}:`, err);
          // Responder pedindo texto
          const sUrl = payload?.BaseUrl?.replace(/\/+$/, '') || Deno.env.get('UAZAPI_SERVER_URL');
          const iTok = payload?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');
          if (sUrl && iTok) {
            await sendMessage(sUrl, iTok, telefone, 'Desculpe, não consegui ouvir seu áudio. Pode digitar sua resposta, por favor?');
          }
          return new Response(JSON.stringify({ success: true, audio_error: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (!telefone || !texto) {
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Mensagem de ${telefone}: "${texto}"`);

    // --- INTERCEPTAÇÃO: Admin respondendo instrução para cliente pendente ---
    if (isAdminNumber(telefone)) {
      const instanceTokenAdmin = payload?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');
      const serverUrlAdmin = payload?.BaseUrl?.replace(/\/+$/, '') || Deno.env.get('UAZAPI_SERVER_URL');

      if (instanceTokenAdmin) {
        const pendingKey = `admin_pending_${instanceTokenAdmin}`;
        const { data: pendingRecord } = await supabase
          .from('chatbot_conversas')
          .select('dados')
          .eq('telefone', pendingKey)
          .eq('etapa', 'admin_pending')
          .maybeSingle();

        if (pendingRecord?.dados) {
          const dados = pendingRecord.dados as any;
          
          // CASO 1: Aguardando confirmação
          if (dados.aguardando_confirmacao) {
            const confirmacoes = ['sim', 'ok', 'confirmo', 'confirmar', 'pode enviar', 'tudo certo', 'perfeito', 'pode'];
            const negacoes = ['não', 'nao', 'cancela', 'cancelar', 'espera', 'aguarda', 'refaz', 'muda'];
            const textoLower = texto.toLowerCase();
            
            // Confirmação positiva
            if (confirmacoes.some(c => textoLower.includes(c))) {
              const clienteTelefone = dados.cliente_telefone;
              const clienteServerUrl = dados.server_url || serverUrlAdmin;
              const clienteInstanceToken = dados.instance_token || instanceTokenAdmin;
              const respostaProposta = dados.resposta_proposta;
              
              console.log(`[ADMIN-CONFIRM] Admin confirmou envio para ${clienteTelefone}: "${respostaProposta}"`);
              
              // Enviar mensagem ao cliente com simulação de digitação
              const delay = Math.floor(Math.random() * 10000) + 5000;
              await simulateTyping(clienteServerUrl, clienteInstanceToken, clienteTelefone, delay);
              await sendMessage(clienteServerUrl, clienteInstanceToken, clienteTelefone, respostaProposta);
              
              // Registrar aprendizado
              const mensagemOriginalCliente = dados.mensagem_original_cliente || '';
              const gatilhoAprendido = await registrarAprendizado(
                supabase,
                mensagemOriginalCliente,
                respostaProposta,
                dados.contexto || {}
              );
              
              // Desbloquear conversa do cliente
              const { data: clienteConv } = await supabase
                .from('chatbot_conversas')
                .select('etapa, dados')
                .eq('telefone', clienteTelefone)
                .maybeSingle();

              if (clienteConv?.etapa === 'aguardando_humano') {
                const etapaAnterior = (clienteConv.dados as any)?.etapa_antes_humano || 'proposta_enviada';
                const dadosCliente = clienteConv.dados || {};
                const dadosDesbloq = { ...(dadosCliente as any) };
                delete dadosDesbloq.etapa_antes_humano;
                const historico = dadosDesbloq.mensagens_historico || [];
                historico.push({ role: 'assistente', content: respostaProposta, ts: new Date().toISOString() });
                dadosDesbloq.mensagens_historico = historico.slice(-20);

                await supabase.from('chatbot_conversas').upsert({
                  telefone: clienteTelefone,
                  etapa: etapaAnterior,
                  dados: dadosDesbloq,
                  atualizado_em: new Date().toISOString(),
                }, { onConflict: 'telefone' });
                console.log(`[ADMIN-CONFIRM] Cliente ${clienteTelefone} desbloqueado: aguardando_humano -> ${etapaAnterior}`);
              }
              
              // Limpar registro pendente
              await supabase.from('chatbot_conversas').delete().eq('telefone', pendingKey);
              
              // Confirmar ao admin com informação do aprendizado
              const telefoneFormatado = clienteTelefone.replace(/^55/, '');
              const msgConfirmacao = `✅ Mensagem enviada para ${telefoneFormatado}.\n\n` +
                `📚 Ensinamento registrado! Quando alguém disser algo similar a "${mensagemOriginalCliente}", responderei automaticamente com base no gatilho "${gatilhoAprendido}".`;
              await sendMessage(serverUrlAdmin!, instanceTokenAdmin, ADMIN_NUMERO, msgConfirmacao);
              
              return new Response(JSON.stringify({ success: true, admin_confirmed: true, cliente: clienteTelefone }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            // Negação
            if (negacoes.some(n => textoLower.includes(n))) {
              console.log(`[ADMIN-CANCEL] Admin cancelou envio`);
              await supabase.from('chatbot_conversas').delete().eq('telefone', pendingKey);
              await sendMessage(serverUrlAdmin!, instanceTokenAdmin, ADMIN_NUMERO, '❌ Cancelado. Envie nova instrução quando quiser.');
              
              return new Response(JSON.stringify({ success: true, admin_cancelled: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            // Resposta ambígua
            console.log(`[ADMIN-AMBIGUOUS] Resposta ambígua do admin: "${texto}"`);
            await sendMessage(serverUrlAdmin!, instanceTokenAdmin, ADMIN_NUMERO, 'Por favor responda "sim" para confirmar ou "não" para cancelar.');
            
            return new Response(JSON.stringify({ success: true, admin_ambiguous: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          // CASO 2: Primeira instrução do admin (gerar proposta)
          const clienteTelefone = dados.cliente_telefone;
          const clienteServerUrl = dados.server_url || serverUrlAdmin;
          const clienteInstanceToken = dados.instance_token || instanceTokenAdmin;
          const contextoCliente = dados.contexto || {};
          
          console.log(`[ADMIN-INSTRUCTION] Admin enviou instrução para ${clienteTelefone}: "${texto}"`);
          
          // Parse instrução
          const instrucao = parseAdminInstruction(texto);
          let respostaProposta: string;
          
          if (instrucao.literal) {
            respostaProposta = instrucao.conteudo;
            console.log(`[ADMIN-INSTRUCTION] Modo literal: "${respostaProposta}"`);
          } else {
            respostaProposta = await gerarRespostaComInstrucaoAdmin(instrucao.conteudo, contextoCliente);
            console.log(`[ADMIN-INSTRUCTION] Modo IA: instrução="${instrucao.conteudo}" -> resposta="${respostaProposta}"`);
          }
          
          // Obter mensagem original do cliente do histórico
          const mensagemOriginalCliente = contextoCliente?.mensagens_historico?.slice(-1)[0]?.content || texto;
          
          // Enviar proposta ao admin para confirmação
          const msgConfirmacao = `Ok entendido, irei responder o seguinte:\n\n"${respostaProposta}"\n\nVocê confirma?`;
          await sendMessage(serverUrlAdmin!, instanceTokenAdmin, ADMIN_NUMERO, msgConfirmacao);
          
          // Atualizar registro pendente com proposta e flag de aguardando confirmação
          await supabase.from('chatbot_conversas').upsert({
            telefone: pendingKey,
            etapa: 'admin_pending',
            dados: {
              ...dados,
              instrucao_admin: texto,
              resposta_proposta: respostaProposta,
              mensagem_original_cliente: mensagemOriginalCliente,
              aguardando_confirmacao: true
            },
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'telefone' });
          
          console.log(`[ADMIN-INSTRUCTION] Proposta enviada ao admin, aguardando confirmação`);
          
          return new Response(JSON.stringify({ success: true, admin_proposal_sent: true, cliente: clienteTelefone }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // --- CASO 3: Admin especifica número de telefone direto na mensagem ---
      const targeted = parseAdminInstructionWithTarget(texto);
      if (targeted.telefoneAlvo) {
        console.log(`[ADMIN-TARGET] Telefone alvo: ${targeted.telefoneAlvo}, instrução: "${targeted.instrucao}"`);
        
        // Buscar conversa do cliente alvo
        const { data: clienteConv } = await supabase
          .from('chatbot_conversas')
          .select('telefone, etapa, dados, server_url, instance_token')
          .eq('telefone', targeted.telefoneAlvo)
          .maybeSingle();
        
        if (clienteConv) {
          const dadosCliente = (clienteConv.dados || {}) as any;
          const clienteServerUrl = clienteConv.server_url || serverUrlAdmin;
          const clienteInstanceToken = clienteConv.instance_token || instanceTokenAdmin;
          const instrucaoTexto = targeted.instrucao;
          
          let respostaProposta: string;
          
          // Se a instrução menciona "proposta", gerar proposta financeira com valores
          if (/propost|valor|ofert/i.test(instrucaoTexto)) {
            const valorAvista = dadosCliente.valor_avista;
            const valorParcelado = dadosCliente.valor_parcelado;
            if (valorAvista && valorParcelado) {
              respostaProposta = gerarMensagemProposta(Number(valorAvista), Number(valorParcelado));
              console.log(`[ADMIN-TARGET] Proposta financeira gerada com valores: avista=${valorAvista}, parcelado=${valorParcelado}`);
            } else {
              respostaProposta = await gerarRespostaComInstrucaoAdmin(instrucaoTexto, dadosCliente);
              console.log(`[ADMIN-TARGET] Sem valores financeiros, usando IA para gerar resposta`);
            }
          } else {
            // Instrução livre → IA gera resposta
            const instrucaoParsed = parseAdminInstruction(instrucaoTexto);
            if (instrucaoParsed.literal) {
              respostaProposta = instrucaoParsed.conteudo;
            } else {
              respostaProposta = await gerarRespostaComInstrucaoAdmin(instrucaoParsed.conteudo, dadosCliente);
            }
          }
          
          // Obter mensagem original do cliente do histórico
          const mensagemOriginalCliente = dadosCliente?.mensagens_historico?.slice(-1)?.[0]?.content || '';
          
          // Criar registro admin_pending para confirmação
          const pendingKeyTarget = `admin_pending_${instanceTokenAdmin}`;
          await supabase.from('chatbot_conversas').upsert({
            telefone: pendingKeyTarget,
            etapa: 'admin_pending',
            dados: {
              cliente_telefone: targeted.telefoneAlvo,
              server_url: clienteServerUrl,
              instance_token: clienteInstanceToken,
              contexto: dadosCliente,
              instrucao_admin: texto,
              resposta_proposta: respostaProposta,
              mensagem_original_cliente: mensagemOriginalCliente,
              aguardando_confirmacao: true
            },
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'telefone' });
          
          // Enviar proposta ao admin para confirmação
          const msgConfirmacao = `Ok entendido, irei responder ao ${targeted.telefoneAlvo.replace(/^55/, '')}:\n\n"${respostaProposta}"\n\nVocê confirma?`;
          await sendMessage(serverUrlAdmin!, instanceTokenAdmin!, ADMIN_NUMERO, msgConfirmacao);
          
          console.log(`[ADMIN-TARGET] Proposta enviada ao admin para confirmação`);
          return new Response(JSON.stringify({ success: true, admin_target_proposal: true, cliente: targeted.telefoneAlvo }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.log(`[ADMIN-TARGET] Conversa não encontrada para ${targeted.telefoneAlvo}`);
          await sendMessage(serverUrlAdmin!, instanceTokenAdmin!, ADMIN_NUMERO, `❌ Não encontrei conversa ativa com o número ${targeted.telefoneAlvo.replace(/^55/, '')}. Verifique o número e tente novamente.`);
          return new Response(JSON.stringify({ success: true, admin_target_not_found: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // FALLBACK: encaminhar para teach-chatbot (ensino, perguntas, ações)
      console.log(`[ADMIN-FALLBACK] Encaminhando mensagem do admin para teach-chatbot: "${texto}"`);
      try {
        // Carregar histórico recente do admin via chat_ia_mensagens
        const { data: adminUser } = await supabase.from('profiles').select('id').eq('email', 'rodrigo@grupoaltum.com.br').maybeSingle();
        const adminUserId = adminUser?.id;
        
        let historicoMessages: any[] = [];
        if (adminUserId) {
          const { data: historico } = await supabase
            .from('chat_ia_mensagens')
            .select('role, content')
            .eq('user_id', adminUserId)
            .order('criado_em', { ascending: false })
            .limit(10);
          if (historico) {
            historicoMessages = historico.reverse().map((m: any) => ({ role: m.role, content: m.content }));
          }
        }

        // Adicionar mensagem atual do admin
        historicoMessages.push({ role: 'user', content: texto });

        // Chamar teach-chatbot
        const teachResponse = await fetch(`${supabaseUrl}/functions/v1/teach-chatbot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ messages: historicoMessages }),
        });

        if (teachResponse.ok) {
          const teachData = await teachResponse.json();
          const reply = teachData.reply || 'Desculpe, não consegui processar.';

          // Persistir mensagens no histórico (admin msg + resposta)
          if (adminUserId) {
            await supabase.from('chat_ia_mensagens').insert([
              { user_id: adminUserId, role: 'user', content: texto },
              { user_id: adminUserId, role: 'assistant', content: reply },
            ]);
          }

          // Enviar resposta ao admin via WhatsApp
          await sendMessage(serverUrlAdmin!, instanceTokenAdmin!, ADMIN_NUMERO, reply);

          console.log(`[ADMIN-FALLBACK] Resposta enviada ao admin: "${reply.slice(0, 100)}..."`);
          return new Response(JSON.stringify({ success: true, admin_fallback: true, regra_criada: teachData.regra_criada, mensagem_enviada: teachData.mensagem_enviada }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.error(`[ADMIN-FALLBACK] Erro ao chamar teach-chatbot: ${teachResponse.status}`);
          await sendMessage(serverUrlAdmin!, instanceTokenAdmin!, ADMIN_NUMERO, '⚠️ Não consegui processar sua mensagem. Tente novamente.');
        }
      } catch (fallbackErr) {
        console.error('[ADMIN-FALLBACK] Erro:', fallbackErr);
        await sendMessage(serverUrlAdmin!, instanceTokenAdmin!, ADMIN_NUMERO, '⚠️ Erro ao processar. Tente novamente.');
      }

      return new Response(JSON.stringify({ success: true, admin_fallback_attempted: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- DEBOUNCE: buffer de mensagens para evitar respostas duplicadas ---
    const debounceTimestamp = new Date().toISOString();

    // Append mensagem ao buffer e registrar timestamp
    await supabase.rpc('chatbot_append_buffer', {
      p_telefone: telefone,
      p_texto: texto,
      p_timestamp: debounceTimestamp,
    });

    // Esperar 4 segundos para mensagens seguidas chegarem
    await new Promise(r => setTimeout(r, 4000));

    // Re-ler conversa para verificar se somos o webhook mais recente
    const { data: convDebounce } = await supabase
      .from('chatbot_conversas')
      .select('ultimo_webhook_em, mensagens_pendentes')
      .eq('telefone', telefone)
      .maybeSingle();

    if (convDebounce?.ultimo_webhook_em && convDebounce.ultimo_webhook_em > debounceTimestamp) {
      console.log(`[DEBOUNCE] Webhook mais recente detectado para ${telefone}, abortando este.`);
      return new Response(JSON.stringify({ success: true, deferred: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Somos o mais recente — pegar todas as mensagens pendentes e limpar buffer
    const mensagensPendentes = convDebounce?.mensagens_pendentes || [texto];
    if (mensagensPendentes.length > 1) {
      console.log(`[DEBOUNCE] Combinando ${mensagensPendentes.length} mensagens de ${telefone}: ${JSON.stringify(mensagensPendentes)}`);
      texto = mensagensPendentes.join('\n');
    }
    // Limpar buffer atomicamente
    await supabase
      .from('chatbot_conversas')
      .update({ mensagens_pendentes: [], ultimo_webhook_em: null })
      .eq('telefone', telefone);

    // --- FIM DEBOUNCE ---

    // Chatbot ativo?
    const { data: chatbotConfig } = await supabase.from('chatbot_config').select('ativo').limit(1).single();
    if (!chatbotConfig?.ativo) {
      return new Response(JSON.stringify({ success: true, ignored: true, reason: 'disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- CARREGAR REGRAS CUSTOMIZADAS E TEMPLATES ---
    const { data: regrasCustomizadas } = await supabase
      .from('chatbot_regras')
      .select('gatilho, resposta')
      .eq('ativo', true);

    const { data: templatesAtivos } = await supabase
      .from('chatbot_templates')
      .select('etapa, template')
      .eq('ativo', true);

    const templateMap = new Map<string, string>((templatesAtivos || []).map((t: any) => [t.etapa, t.template]));

    // Helper para substituir variáveis nos templates
    function aplicarVariaveisTemplate(tmpl: string, dadosCtx: any): string {
      const primeiroNome = dadosCtx.nome ? dadosCtx.nome.split(' ')[0] : '';
      const primeiroNomeCap = primeiroNome ? primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase() : '';
      const cpfFormatadoTmpl = dadosCtx.cpf ? formatCpf(dadosCtx.cpf) : '';
      return tmpl
        .replace(/\{primeiro_nome\}/g, primeiroNomeCap)
        .replace(/\{nome_completo\}/g, dadosCtx.nome || '')
        .replace(/\{cpf_formatado\}/g, cpfFormatadoTmpl)
        .replace(/\{valor_avista\}/g, dadosCtx.valor_avista ? formatCurrency(Number(dadosCtx.valor_avista)) : '')
        .replace(/\{valor_parcela\}/g, dadosCtx.valor_parcela_calc ? formatCurrency(Number(dadosCtx.valor_parcela_calc)) : '')
        .replace(/\{valor_parcelado\}/g, dadosCtx.valor_parcelado ? formatCurrency(Number(dadosCtx.valor_parcelado)) : '')
        .replace(/\{max_parcelas\}/g, String(dadosCtx.max_parcelas || ''))
        .replace(/\{credor\}/g, dadosCtx.credor || '')
        .replace(/\{telefone_contato\}/g, '(62) 98218-3144');
    }

    const serverUrl = payload?.BaseUrl?.replace(/\/+$/, '') || Deno.env.get('UAZAPI_SERVER_URL');
    const instanceToken = payload?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN');

    // Check instance owner
    if (instanceToken) {
      const { data: instanceRecord } = await supabase
        .from('user_whatsapp_instances')
        .select('user_id, ativo, apenas_lembretes, ia_responde')
        .eq('instance_token', instanceToken)
        .limit(1)
        .maybeSingle();

      // If instance exists but is deactivated, silently ignore
      if (instanceRecord && !instanceRecord.ativo) {
        console.log(`[CHATBOT] Instance ${instanceToken} is deactivated, ignoring.`);
        return new Response(JSON.stringify({ success: true, ignored: true, reason: 'instance_deactivated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If instance is marked as reminder-only, skip chatbot processing
      if (instanceRecord?.apenas_lembretes) {
        console.log(`[CHATBOT] Instance ${instanceToken} is reminder-only, ignoring.`);
        return new Response(JSON.stringify({ success: true, ignored: true, reason: 'reminder_only' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (instanceRecord?.user_id) {
        // If ia_responde is enabled, allow chatbot processing regardless of owner role
        if (instanceRecord.ia_responde) {
          console.log(`[CHATBOT] Instance has ia_responde enabled, proceeding with AI chatbot.`);
        } else {
          // Check if owner is admin - chatbot only works for admin instances when ia_responde is off
          const { data: ownerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', instanceRecord.user_id)
            .eq('role', 'admin')
            .maybeSingle();

          if (!ownerRole) {
            console.log(`[CHATBOT] Instance owner ${instanceRecord.user_id} is not admin and ia_responde is off, ignoring.`);
            return new Response(JSON.stringify({ success: true, ignored: true, reason: 'owner_not_admin' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('whatsapp_lembretes_habilitado')
          .eq('id', instanceRecord.user_id)
          .single();
        if (ownerProfile && !ownerProfile.whatsapp_lembretes_habilitado) {
          return new Response(JSON.stringify({ success: true, ignored: true, reason: 'owner_disabled' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (!serverUrl || !instanceToken) {
      return new Response(JSON.stringify({ success: false, error: 'Credenciais não configuradas' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Estado da conversa ---
    const { data: conversa } = await supabase.from('chatbot_conversas').select('*').eq('telefone', telefone).single();
    let etapaAtual = conversa?.etapa || 'novo';
    let dados = conversa?.dados || {};

    // --- ATENDIMENTO HUMANO: Se operador está atendendo, ignorar mensagem ---
    if (etapaAtual === 'atendimento_humano' && dados.atendimento_humano_em) {
      const inicioAtendimento = new Date(dados.atendimento_humano_em);
      const minutosDecorridos = (Date.now() - inicioAtendimento.getTime()) / 60000;
      
      if (minutosDecorridos < 30) {
        console.log(`[SILENCED] Bot pausado para ${telefone} (atendimento humano há ${Math.round(minutosDecorridos)}min)`);
        // Apenas bufferar no histórico sem responder
        dados = addToHistorico(dados, 'cliente', texto);
        await supabase.from('chatbot_conversas').upsert({
          telefone,
          etapa: 'atendimento_humano',
          dados,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'telefone' });
        return new Response(JSON.stringify({ success: true, silenced: true, reason: 'atendimento_humano' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Expirou → restaurar etapa anterior
      const etapaAnterior = dados.etapa_antes_humano || 'novo';
      console.log(`[HUMAN-EXPIRED] Atendimento humano expirou para ${telefone} (${Math.round(minutosDecorridos)}min), restaurando etapa: ${etapaAnterior}`);
      etapaAtual = etapaAnterior;
      delete dados.atendimento_humano_em;
      delete dados.etapa_antes_humano;
    }

    dados = addToHistorico(dados, 'cliente', texto);

    const textoLower = texto.toLowerCase().trim();

    // Reset commands
    if (['menu', 'inicio', 'início', 'voltar', 'reiniciar'].includes(textoLower) && etapaAtual !== 'novo') {
      etapaAtual = 'novo';
      dados = { mensagens_historico: dados.mensagens_historico || [] };
    }

    // Greetings reset only if not in active negotiation
    const etapasAtivas = ['proposta_enviada', 'oferta_valores', 'aguardando_parcelas', 'aguardando_confirmacao_identidade', 'aguardando_pagamento_hoje', 'aguardando_data', 'aguardando_humano', 'atendimento_humano'];
    if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(textoLower) && etapaAtual !== 'novo' && !etapasAtivas.includes(etapaAtual)) {
      etapaAtual = 'novo';
      dados = { mensagens_historico: dados.mensagens_historico || [] };
    }

    let resposta = '';

    // Extract instance phone number from payload or database
    let telefoneInstancia = (payload?.phone || payload?.instance?.wuid || payload?.wuid || payload?.instanceId || '').replace(/\D/g, '') || '';
    
    // Fallback: buscar número da instância no banco usando o token
    if (!telefoneInstancia && instanceToken) {
      try {
        const { data: instData } = await supabase
          .from('user_whatsapp_instances')
          .select('nome')
          .eq('instance_token', instanceToken)
          .eq('ativo', true)
          .limit(1)
          .single();
        if (instData?.nome) {
          telefoneInstancia = instData.nome.replace(/\D/g, '') || '';
        }
      } catch (e) {
        console.log('[INSTANCE] Falha ao buscar número da instância no banco:', e);
      }
    }
    
    // Fallback: extrair do server_url se possível
    if (!telefoneInstancia && serverUrl) {
      const match = serverUrl.match(/(\d{10,13})/);
      if (match) telefoneInstancia = match[1];
    }
    
    if (!telefoneInstancia) telefoneInstancia = 'desconhecido';

    // Helper to save state and respond
    async function salvarEResponder(novaEtapa: string, dadosExtra?: any) {
      dados = addToHistorico(dados, 'assistente', resposta);
      await supabase.from('chatbot_conversas').upsert({
        telefone, etapa: novaEtapa, dados: { ...dados, ...dadosExtra },
        server_url: serverUrl, instance_token: instanceToken,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'telefone' });

      const delay = Math.floor(Math.random() * 16000) + 15000;
      await simulateTyping(serverUrl!, instanceToken!, telefone, delay);
      await sendMessage(serverUrl!, instanceToken!, telefone, resposta);
    }

    // Helper to save state WITHOUT responding (silence mode)
    async function salvarSilenciosoENotificar(etapaOriginal: string, textoCliente: string) {
      await supabase.from('chatbot_conversas').upsert({
        telefone, etapa: 'aguardando_humano',
        dados: { ...dados, etapa_antes_humano: etapaOriginal },
        server_url: serverUrl, instance_token: instanceToken,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'telefone' });

      // Save admin_pending record so admin can reply via WhatsApp
      const pendingKey = `admin_pending_${instanceToken}`;
      await supabase.from('chatbot_conversas').upsert({
        telefone: pendingKey,
        etapa: 'admin_pending',
        dados: { cliente_telefone: telefone, instance_token: instanceToken, server_url: serverUrl, contexto: dados },
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'telefone' });

      await notificarAdmin(serverUrl!, instanceToken!, telefone, telefoneInstancia, textoCliente);
    }

    // =============================================
    // VERIFICAR REGRAS CUSTOMIZADAS (chatbot_regras)
    // =============================================
    // Regras só se aplicam em etapas ativas de negociação (não no fluxo inicial de identificação)
    const etapasRegraPermitida = ['proposta_enviada', 'oferta_valores', 'aguardando_pagamento_hoje', 'aguardando_data', 'aguardando_humano'];
    if (regrasCustomizadas && regrasCustomizadas.length > 0 && etapasRegraPermitida.includes(etapaAtual)) {
      let regraAplicada = false;
      for (const regra of regrasCustomizadas) {
        if (textoLower.includes(regra.gatilho.toLowerCase())) {
          console.log(`[REGRA] Gatilho "${regra.gatilho}" detectado em "${textoLower}" — aplicando resposta customizada`);
          resposta = aplicarVariaveisTemplate(regra.resposta, dados);
          await salvarEResponder(etapaAtual);
          regraAplicada = true;
          break;
        }
      }
      if (regraAplicada) {
        return new Response(JSON.stringify({ success: true, regra_aplicada: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // =============================================
    // FLUXO PRINCIPAL — RESPOSTAS FIXAS/EXATAS
    // =============================================

    switch (etapaAtual) {
      // -------- NOVO / AGUARDANDO CPF --------
      case 'novo':
      case 'aguardando_cpf': {
        if (etapaAtual === 'novo') {
          // Try to find client by phone
          const phoneSuffix = telefone.slice(-10);
          const phoneSuffix11 = telefone.slice(-11);

          const { data: devedoresPorTelefone } = await supabase
            .from('devedores')
            .select('nome, cpf, telefone, valor_atualizado, credor')
            .eq('ativo', true)
            .or(`telefone.ilike.%${phoneSuffix},telefone.ilike.%${phoneSuffix11}`);

          let devedoresEncontrados = devedoresPorTelefone || [];

          if (devedoresEncontrados.length === 0) {
            const { data: telefonesAdicionais } = await supabase
              .from('devedor_telefones')
              .select('devedor_cpf, numero')
              .eq('ativo', true)
              .or(`numero.ilike.%${phoneSuffix},numero.ilike.%${phoneSuffix11}`);

            if (telefonesAdicionais && telefonesAdicionais.length > 0) {
              const cpfsUnicos = [...new Set(telefonesAdicionais.map((t: any) => t.devedor_cpf))];
              const { data: devedoresPorCpf } = await supabase
                .from('devedores')
                .select('nome, cpf, telefone, valor_atualizado, credor')
                .eq('ativo', true)
                .in('cpf', cpfsUnicos);
              if (devedoresPorCpf && devedoresPorCpf.length > 0) {
                devedoresEncontrados = devedoresPorCpf;
              }
            }
          }

          if (devedoresEncontrados.length > 0) {
            const cpfsUnicos = [...new Set(devedoresEncontrados.map((d: any) => d.cpf.replace(/\D/g, '')))];

            if (cpfsUnicos.length === 1) {
              const cpfLimpo = cpfsUnicos[0];
              const devedor = devedoresEncontrados[0];
              const cpfFormatado = formatCpf(cpfLimpo);
              resposta = `Só pra confirmar, seu CPF é ${cpfFormatado}?`;
              dados = { ...dados, cpf_candidato: cpfLimpo, nome_candidato: devedor.nome, credor_candidato: devedor.credor };
              await salvarEResponder('aguardando_confirmacao_identidade');
              break;
            } else {
              // Multiple CPFs — ask confirmation of first
              const devedor = devedoresEncontrados[0];
              const cpfLimpo = devedor.cpf.replace(/\D/g, '');
              const cpfFormatado = formatCpf(cpfLimpo);
              resposta = `Só pra confirmar, seu CPF é ${cpfFormatado}?`;
              dados = { ...dados, cpf_candidato: cpfLimpo, nome_candidato: devedor.nome, credor_candidato: devedor.credor };
              await salvarEResponder('aguardando_confirmacao_identidade');
              break;
            }
          }

          // No match — ask CPF
          const tmplSaudacao = templateMap.get('saudacao');
          resposta = tmplSaudacao
            ? aplicarVariaveisTemplate(tmplSaudacao, dados)
            : `Olá! Para consultar sua situação, por favor me informe seu CPF.`;
          await salvarEResponder('aguardando_cpf');
          break;
        }

        // Waiting for CPF input
        const cpf = extractCpf(texto);
        if (!cpf) {
          const tentativasCpf = ((dados as any).tentativas_cpf || 0) + 1;
          dados = { ...dados, tentativas_cpf: tentativasCpf };
          
          if (tentativasCpf <= 1) {
            resposta = `Não consegui identificar um CPF válido. Por favor, envie seu CPF com 11 dígitos. Exemplo: 123.456.789-00`;
            await salvarEResponder('aguardando_cpf');
          } else {
            await salvarSilenciosoENotificar('aguardando_cpf', texto);
          }
          break;
        }

        // Look up debts
        const { data: debitos, error: debitosError } = await supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpf });

        if (debitosError || !debitos || debitos.length === 0) {
          resposta = debitos?.length === 0
            ? `Não encontramos pendências para o CPF ${formatCpf(cpf)}. Se acredita que há algum erro, entre em contato: (62) 98218-3144.`
            : `Desculpe, tive um problema ao consultar seus dados. Tente novamente mais tarde ou ligue para (62) 98218-3144.`;
          await salvarEResponder('sem_debitos', { cpf });
          break;
        }

        // Found debts — go to proposal
        const nomeDevedor = debitos[0].nome;
        const primeiroNome = nomeDevedor.split(' ')[0];
        const primeiroNomeCap = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
        const valorTotal = debitos.reduce((sum: number, d: any) => sum + Number(d.valor_atualizado), 0);

        // Fetch credor
        const { data: devedorInfo } = await supabase.from('devedores').select('credor').eq('cpf', cpf).eq('ativo', true).limit(1).single();
        const credorNome = getCredorNome(devedorInfo?.credor || '');

        const dadosParaTemplate = { ...dados, cpf, nome: nomeDevedor, valor_avista: valorTotal * 0.5, valor_parcelado: valorTotal * 0.7, credor: credorNome };
        const tmplProposta = templateMap.get('proposta');
        resposta = tmplProposta
          ? aplicarVariaveisTemplate(tmplProposta, dadosParaTemplate)
          : `Olá ${primeiroNomeCap}, você consegue voltar a pagar suas parcelas em aberto com ${credorNome} com 50% de desconto?`;

        const valorAvista = valorTotal * 0.5;
        const valorParcelado = valorTotal * 0.7;
        let maxParcelas = Math.floor(valorParcelado / VALOR_MINIMO_PARCELA);
        if (maxParcelas > 24) maxParcelas = 24;
        if (maxParcelas < 2) maxParcelas = 2;

        dados = {
          ...dados, cpf, nome: nomeDevedor, valor_total: valorTotal,
          valor_avista: valorAvista, valor_parcelado: valorParcelado,
          max_parcelas: maxParcelas, credor: credorNome,
        };
        await salvarEResponder('proposta_enviada');
        break;
      }

      // -------- CONFIRMAÇÃO DE IDENTIDADE --------
      case 'aguardando_confirmacao_identidade': {
        const confirmou = await interpretarIntencao(texto, ['sim', 'nao']);
        const isConfirmacao = confirmou?.includes('sim') ||
          ['sim', 'sou', 'sou eu', 'isso', 'correto', 'sou sim', 'eu mesmo', 'eu mesma', 'isso mesmo', 'exato'].includes(textoLower);
        const isNegacao = confirmou?.includes('nao') ||
          ['não', 'nao', 'não sou', 'nao sou', 'errado', 'não é', 'nao e'].includes(textoLower);

        if (isConfirmacao) {
          const cpf = dados.cpf_candidato;
          const { data: debitos, error: debitosError } = await supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpf });

          if (debitosError || !debitos || debitos.length === 0) {
            resposta = debitos?.length === 0
              ? `Não encontramos pendências no seu CPF. Se acredita que há algum erro, ligue para (62) 98218-3144.`
              : `Desculpe, tive um problema ao consultar. Tente novamente ou ligue para (62) 98218-3144.`;
            await salvarEResponder('sem_debitos', { cpf });
            break;
          }

          const nomeDevedor = debitos[0].nome;
          const primeiroNome = nomeDevedor.split(' ')[0];
          const primeiroNomeCap = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
          const valorTotal = debitos.reduce((sum: number, d: any) => sum + Number(d.valor_atualizado), 0);

          const { data: devedorInfo } = await supabase.from('devedores').select('credor').eq('cpf', cpf).eq('ativo', true).limit(1).single();
          const credorNome = getCredorNome(devedorInfo?.credor || dados.credor_candidato || '');

          const valorAvista = valorTotal * 0.5;
          const valorParcelado = valorTotal * 0.7;
          let maxParcelas = Math.floor(valorParcelado / VALOR_MINIMO_PARCELA);
          if (maxParcelas > 24) maxParcelas = 24;
          if (maxParcelas < 2) maxParcelas = 2;

          const dadosParaTemplate2 = { ...dados, cpf, nome: nomeDevedor, valor_avista: valorAvista, valor_parcelado: valorParcelado, max_parcelas: maxParcelas, credor: credorNome };
          const tmplProposta2 = templateMap.get('proposta');
          resposta = tmplProposta2
            ? aplicarVariaveisTemplate(tmplProposta2, dadosParaTemplate2)
            : `Olá ${primeiroNomeCap}, você consegue voltar a pagar suas parcelas em aberto com ${credorNome} com 50% de desconto?`;

          dados = {
            ...dados, cpf, nome: nomeDevedor, valor_total: valorTotal,
            valor_avista: valorAvista, valor_parcelado: valorParcelado,
            max_parcelas: maxParcelas, credor: credorNome,
          };
          await salvarEResponder('proposta_enviada');
          break;

        } else if (isNegacao) {
          resposta = `Desculpe pelo engano! Me informe seu CPF para que eu possa consultar sua situação.`;
          dados = { mensagens_historico: dados.mensagens_historico || [] };
          await salvarEResponder('aguardando_cpf');
          break;

        } else {
          resposta = `Desculpe, não entendi. Você é *${dados.nome_candidato}*? Responda *sim* ou *não*.`;
          await salvarEResponder('aguardando_confirmacao_identidade');
          break;
        }
      }

      // -------- PROPOSTA ENVIADA (50% desconto?) --------
      case 'proposta_enviada': {
        // Check if client is asking about specific installments (e.g. "como fica em 12x?")
        const matchParcelasProposta = texto.match(/(\d+)\s*(?:x|vezes|parcelas?)/i) || texto.match(/em\s+(\d+)\b/i);
        
        if (matchParcelasProposta) {
          const parcelasPedidas = parseInt(matchParcelasProposta[1]);
          
          // Recalculate values if needed
          let vaP = Number(dados.valor_avista);
          let vpP = Number(dados.valor_parcelado);
          let mpP = Number(dados.max_parcelas);
          if (!vaP || isNaN(vaP)) {
            let vt = Number(dados.valor_total);
            if (!vt || isNaN(vt)) {
              const cpfF = dados.cpf;
              if (cpfF) {
                const { data: df } = await supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpfF });
                if (df && df.length > 0) vt = df.reduce((s: number, d: any) => s + Number(d.valor_atualizado), 0);
              }
            }
            if (vt && !isNaN(vt)) {
              vaP = vt * 0.5;
              vpP = vt * 0.7;
              mpP = Math.min(24, Math.floor(vpP / VALOR_MINIMO_PARCELA));
              if (mpP < 2) mpP = 2;
              dados = { ...dados, valor_total: vt, valor_avista: vaP, valor_parcelado: vpP, max_parcelas: mpP };
            }
          }

          if (parcelasPedidas === 1) {
            dados = { ...dados, tipo_pagamento: 'avista', parcelas: 1, valor_final: vaP };
            resposta = `À vista fica *${formatCurrency(vaP)}*. Você consegue fazer o pagamento hoje?`;
            await salvarEResponder('aguardando_pagamento_hoje');
            break;
          } else if (parcelasPedidas >= 2 && parcelasPedidas <= 24 && vpP / parcelasPedidas >= VALOR_MINIMO_PARCELA) {
            const valorParcCalc = vpP / parcelasPedidas;
            dados = { ...dados, tipo_pagamento: 'parcelado', parcelas: parcelasPedidas, valor_final: vpP };
            resposta = `Em ${parcelasPedidas}x fica *${formatCurrency(valorParcCalc)}* cada parcela. Você consegue fazer o pagamento hoje?`;
            await salvarEResponder('aguardando_pagamento_hoje');
            break;
          } else {
            const maxParc = mpP || 24;
            resposta = `O parcelamento pode ser de 2x a ${maxParc}x com parcela mínima de R$ 100,00. Como prefere?`;
            await salvarEResponder('oferta_valores');
            break;
          }
        }

        // Detect greetings and interest expressions
        const isSaudacao = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|boa noite)\s*[!.,]?\s*$/i.test(textoLower.trim());
        const isInteresse = /(como fica|qual.?valor|quanto|me fala|explica|fala mais|me interessa|tenho interesse|quero saber|quero ver|quero negociar|pode me explicar|como funciona|como que|qual proposta|qual a proposta)/i.test(textoLower);

        // Saudação isolada — responder de forma conversacional e permanecer na mesma etapa
        if (isSaudacao && !isInteresse) {
          const primeiroNomeCap = dados.nome
            ? dados.nome.split(' ')[0].charAt(0).toUpperCase() + dados.nome.split(' ')[0].slice(1).toLowerCase()
            : '';
          const saudacaoTexto = textoLower.includes('bom dia') ? 'Bom dia' : textoLower.includes('boa tarde') ? 'Boa tarde' : textoLower.includes('boa noite') ? 'Boa noite' : 'Olá';
          resposta = primeiroNomeCap
            ? `${saudacaoTexto}, ${primeiroNomeCap}! Tudo bem? Posso te passar a proposta?`
            : `${saudacaoTexto}! Tudo bem? Posso te passar a proposta?`;
          await salvarEResponder('proposta_enviada');
          break;
        }

        // Client responds to "consegue voltar a pagar com 50% de desconto?"
        const intencao = await interpretarIntencao(texto, ['sim', 'nao']);
        const isSim = intencao?.includes('sim') ||
          ['sim', 'consigo', 'sim consigo', 'quero', 'pode ser', 'sim como fica', 'aceito', 'quero sim', 'como fica', 'tô querendo', 'to querendo'].includes(textoLower) ||
          isInteresse;

        if (isSim) {
          // Robust fallback: recalculate if values are missing/NaN
          let valorAvista = Number(dados.valor_avista);
          let valorParcelado = Number(dados.valor_parcelado);
          let maxParcelas = Number(dados.max_parcelas);

          if (!valorAvista || isNaN(valorAvista)) {
            let valorTotal = Number(dados.valor_total);
            if (!valorTotal || isNaN(valorTotal)) {
              // Try to fetch from devedores by CPF
              const cpfFallback = dados.cpf;
              if (cpfFallback) {
                const { data: devsFallback } = await supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpfFallback });
                if (devsFallback && devsFallback.length > 0) {
                  valorTotal = devsFallback.reduce((sum: number, d: any) => sum + Number(d.valor_atualizado), 0);
                }
              }
            }
            if (valorTotal && !isNaN(valorTotal)) {
              valorAvista = valorTotal * 0.5;
              valorParcelado = valorTotal * 0.7;
              maxParcelas = Math.min(24, Math.floor(valorParcelado / VALOR_MINIMO_PARCELA));
              if (maxParcelas < 2) maxParcelas = 2;
              // Save back to dados for subsequent stages
              dados = { ...dados, valor_total: valorTotal, valor_avista: valorAvista, valor_parcelado: valorParcelado, max_parcelas: maxParcelas };
              console.log(`[Fallback] Recalculated: avista=${valorAvista}, parcelado=${valorParcelado}, maxParcelas=${maxParcelas}`);
            }
          }

          resposta = gerarMensagemProposta(valorAvista, valorParcelado);

          await salvarEResponder('oferta_valores');
          break;
        } else {
          // Client said no or unclear — notify admin, stay silent
          console.log(`[SILÊNCIO] proposta_enviada: cliente não aceitou/ambíguo: "${texto}"`);
          await salvarSilenciosoENotificar('proposta_enviada', texto);
          break;
        }
      }

      // -------- OFERTA DE VALORES (avista ou parcelado?) --------
      case 'oferta_valores': {
        // Ensure values are valid numbers with fallback (moved up for reuse)
        let vaOfertas = Number(dados.valor_avista);
        let vpOfertas = Number(dados.valor_parcelado);
        let mpOfertas = Number(dados.max_parcelas);
        if (!vaOfertas || isNaN(vaOfertas)) {
          let vt = Number(dados.valor_total);
          if (!vt || isNaN(vt)) {
            const cpfF = dados.cpf;
            if (cpfF) {
              const { data: df } = await supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpfF });
              if (df && df.length > 0) vt = df.reduce((s: number, d: any) => s + Number(d.valor_atualizado), 0);
            }
          }
          if (vt && !isNaN(vt)) {
            vaOfertas = vt * 0.5;
            vpOfertas = vt * 0.7;
            mpOfertas = Math.min(24, Math.floor(vpOfertas / VALOR_MINIMO_PARCELA));
            if (mpOfertas < 2) mpOfertas = 2;
            dados = { ...dados, valor_total: vt, valor_avista: vaOfertas, valor_parcelado: vpOfertas, max_parcelas: mpOfertas };
          }
        }

        // Check if client is asking about specific installments (e.g. "como fica em 12x?")
        const matchParcelasOferta = texto.match(/(\d+)\s*(?:x|vezes|parcelas?)/i) || texto.match(/em\s+(\d+)\b/i);
        
        if (matchParcelasOferta) {
          const parcelasPedidas = parseInt(matchParcelasOferta[1]);
          
          if (parcelasPedidas === 1) {
            dados = { ...dados, tipo_pagamento: 'avista', parcelas: 1, valor_final: vaOfertas };
            resposta = `À vista fica *${formatCurrency(vaOfertas)}*. Você consegue fazer o pagamento hoje?`;
            await salvarEResponder('aguardando_pagamento_hoje');
            break;
          } else if (parcelasPedidas >= 2 && parcelasPedidas <= 24 && vpOfertas / parcelasPedidas >= VALOR_MINIMO_PARCELA) {
            const valorParcCalc = vpOfertas / parcelasPedidas;
            dados = { ...dados, tipo_pagamento: 'parcelado', parcelas: parcelasPedidas, valor_final: vpOfertas };
            resposta = `Em ${parcelasPedidas}x fica *${formatCurrency(valorParcCalc)}* cada parcela. Você consegue fazer o pagamento hoje?`;
            await salvarEResponder('aguardando_pagamento_hoje');
            break;
          } else {
            resposta = `O parcelamento pode ser de 2x a ${mpOfertas}x com parcela mínima de R$ 100,00. Como prefere?`;
            await salvarEResponder('oferta_valores');
            break;
          }
        }

        // Original flow: classify intent
        let escolha = textoLower === '1' ? 'avista' : textoLower === '2' ? 'parcelado' : null;

        if (!escolha) {
          const intencaoOferta = await interpretarIntencao(texto, ['avista', 'parcelado', 'nenhuma']);
          if (intencaoOferta?.includes('avista')) escolha = 'avista';
          else if (intencaoOferta?.includes('parcelado')) escolha = 'parcelado';
        }

        if (escolha === 'avista') {
          dados = { ...dados, tipo_pagamento: 'avista', parcelas: 1, valor_final: vaOfertas };
          resposta = `Você consegue fazer o pagamento hoje?`;
          await salvarEResponder('aguardando_pagamento_hoje');
          break;

        } else if (escolha === 'parcelado') {
          const listaParc = gerarListaParcelamento(vpOfertas);
          resposta = `Ótimo! Aqui estão as opções de parcelamento:\n\n${listaParc}\n\nEm quantas vezes deseja pagar? Responda com o número (ex: *3x*).`;
          dados = { ...dados, tipo_pagamento: 'parcelado', valor_final: vpOfertas };
          await salvarEResponder('oferta_valores');
          break;

        } else {
          // Check for greetings/interest before giving up
          const isSaudacaoOferta = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií]|tudo bem)/i.test(textoLower);
          const isInteresseOferta = /(como fica|qual.?valor|quanto|me fala|explica|fala mais|me interessa|tenho interesse|quero saber|quero ver|como funciona|como que|qual proposta)/i.test(textoLower);

          if (isSaudacaoOferta || isInteresseOferta) {
            // Re-send the offer with full list
            const listaParc = gerarListaParcelamento(vpOfertas);
            let msgReenvio = `Olá! 😊 Temos uma ótima oportunidade: quitação à vista por *${formatCurrency(vaOfertas)}*.`;
            if (listaParc) {
              msgReenvio += `\n\nOu podemos parcelar:\n\n${listaParc}`;
            }
            msgReenvio += `\n\nComo prefere pagar? Responda com o número de parcelas (ex: *3x*) ou *à vista*.`;
            resposta = msgReenvio;
            await salvarEResponder('oferta_valores');
            break;
          }

          // AI não entendeu — notificar admin e silenciar
          console.log(`[SILÊNCIO] oferta_valores: não entendeu escolha: "${texto}"`);
          await salvarSilenciosoENotificar('oferta_valores', texto);
          break;
        }
      }

      // -------- CONSEGUE PAGAR HOJE? --------
      case 'aguardando_pagamento_hoje': {
        // Detectar pedido de parcelas antes de classificar sim/não
        const matchParcelasHoje = texto.match(/(\d+)\s*(?:x|vezes|parcelas?)/i) || texto.match(/em\s+(\d+)\b/i);
        if (matchParcelasHoje) {
          const parcelasPedidas = parseInt(matchParcelasHoje[1]);
          const vpCalc = dados.valor_parcelado || dados.valor_final || 0;
          const tambemConfirmou = /(sim|consigo|quero|pode ser|ok|fechado|fecha|vamos|bora|isso|esse|essa|aceito)/i.test(textoLower);
          
          if (parcelasPedidas === 1) {
            const vaCalc = dados.valor_avista || vpCalc * 0.5 / 0.7;
            dados = { ...dados, tipo_pagamento: 'avista', parcelas: 1, valor_final: vaCalc };
            if (tambemConfirmou) {
              resposta = `Ok! Iremos te enviar o boleto à vista no valor de *${formatCurrency(vaCalc)}*.`;
              await salvarEResponder('acordo_finalizado', { data_pagamento: 'hoje' });
              await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: 'hoje' });
            } else {
              resposta = `À vista fica *${formatCurrency(vaCalc)}*. Você consegue fazer o pagamento hoje?`;
              await salvarEResponder('aguardando_pagamento_hoje');
            }
            break;
          } else if (parcelasPedidas >= 2 && parcelasPedidas <= 24 && vpCalc / parcelasPedidas >= 100) {
            const valorParcCalc = vpCalc / parcelasPedidas;
            dados = { ...dados, tipo_pagamento: 'parcelado', parcelas: parcelasPedidas, valor_final: vpCalc };
            if (tambemConfirmou) {
              resposta = `Ok! Iremos te enviar o boleto em ${parcelasPedidas}x de *${formatCurrency(valorParcCalc)}*.`;
              await salvarEResponder('acordo_finalizado', { data_pagamento: 'hoje' });
              await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: 'hoje' });
            } else {
              resposta = `Em ${parcelasPedidas}x fica *${formatCurrency(valorParcCalc)}* cada parcela. Você consegue fazer o pagamento hoje?`;
              await salvarEResponder('aguardando_pagamento_hoje');
            }
            break;
          } else {
            const maxP = Math.floor(vpCalc / 100);
            resposta = `O parcelamento pode ser de 2x a ${Math.min(maxP, 24)}x (parcela mínima de R$ 100). Como prefere?`;
            await salvarEResponder('aguardando_pagamento_hoje');
            break;
          }
        }

        const intencao = await interpretarIntencao(texto, ['sim', 'nao']);
        const isSim = intencao?.includes('sim') ||
          ['sim', 'consigo', 'sim consigo', 'hoje mesmo', 'pode ser', 'sim pode', 'ok'].includes(textoLower);
        const isNao = intencao?.includes('nao') ||
          ['não', 'nao', 'não consigo', 'nao consigo', 'agora não', 'agora nao', 'não hoje', 'nao hoje', 'outro dia'].includes(textoLower);

        if (isSim) {
          resposta = `Ok! Iremos te enviar o boleto para pagamento hoje.`;
          // TODO: here you can trigger boleto generation
          await salvarEResponder('acordo_finalizado', { data_pagamento: 'hoje' });
          await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: 'hoje' });
          break;

        } else if (isNao) {
          resposta = `Que dia você pode fazer o pagamento?`;
          await salvarEResponder('aguardando_data');
          break;

        } else {
          // Try to interpret as a date directly
          const dataInformada = extrairData(texto);
          if (dataInformada) {
            const dias = diffDias(new Date(), dataInformada);
            if (dias <= 7 && dias >= 0) {
              resposta = `OK, irei te enviar o boleto para essa data!`;
              await salvarEResponder('acordo_finalizado', { data_pagamento: formatDataBR(dataInformada) });
              await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: formatDataBR(dataInformada) });
            } else {
              resposta = `Infelizmente o prazo máximo para pagamento é de 7 dias. Poderia escolher uma data dentro desse período?`;
              await salvarEResponder('aguardando_data');
            }
            break;
          }

          // AI não entendeu — notificar admin e silenciar
          console.log(`[SILÊNCIO] aguardando_pagamento_hoje: resposta ambígua: "${texto}"`);
          await salvarSilenciosoENotificar('aguardando_pagamento_hoje', texto);
          break;
        }
      }

      // -------- AGUARDANDO DATA DE PAGAMENTO --------
      case 'aguardando_data': {
        const dataInformada = extrairData(texto);

        if (!dataInformada) {
          // Try AI interpretation
          const intencao = await interpretarIntencao(texto, ['hoje', 'amanha', 'nenhuma']);
          if (intencao?.includes('hoje')) {
            resposta = `Ok! Iremos te enviar o boleto para pagamento hoje.`;
            await salvarEResponder('acordo_finalizado', { data_pagamento: 'hoje' });
            await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: 'hoje' });
            break;
          } else if (intencao?.includes('amanha')) {
            const amanha = new Date();
            amanha.setDate(amanha.getDate() + 1);
            resposta = `OK, irei te enviar o boleto para essa data!`;
            await salvarEResponder('acordo_finalizado', { data_pagamento: formatDataBR(amanha) });
            await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: formatDataBR(amanha) });
            break;
          }

          // AI não entendeu a data — notificar admin e silenciar
          console.log(`[SILÊNCIO] aguardando_data: data não identificada: "${texto}"`);
          await salvarSilenciosoENotificar('aguardando_data', texto);
          break;
        }

        const dias = diffDias(new Date(), dataInformada);

        if (dias < 0) {
          resposta = `Essa data já passou. Por favor, informe uma data futura dentro dos próximos 7 dias.`;
          await salvarEResponder('aguardando_data');
          break;
        }

        if (dias > 7) {
          resposta = `Infelizmente o prazo máximo para pagamento é de 7 dias. Poderia escolher uma data até ${formatDataBR((() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })())}?`;
          await salvarEResponder('aguardando_data');
          break;
        }

        resposta = `OK, irei te enviar o boleto para essa data!`;
        await salvarEResponder('acordo_finalizado', { data_pagamento: formatDataBR(dataInformada) });
        await notificarAcordoFechado(serverUrl!, instanceToken!, telefone, { ...dados, data_pagamento: formatDataBR(dataInformada) });
        break;
      }

      // -------- AGUARDANDO HUMANO (IA não soube responder) --------
      case 'aguardando_humano': {
        // Não responde nada ao cliente, apenas re-notifica o admin se insistir
        console.log(`[AGUARDANDO_HUMANO] Cliente ${telefone} insistiu: "${texto}" — re-notificando admin`);
        await notificarAdmin(serverUrl!, instanceToken!, telefone, telefoneInstancia, texto);
        // Salvar histórico sem mudar etapa
        await supabase.from('chatbot_conversas').upsert({
          telefone, etapa: 'aguardando_humano', dados,
          server_url: serverUrl, instance_token: instanceToken,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'telefone' });
        break;
      }

      // -------- ESTADOS FINAIS --------
      case 'acordo_finalizado':
      case 'sem_debitos':
      case 'gerando_boleto': {
        // If client sends something meaningful (not just menu commands), restart the flow
        const isResetCommand = ['menu', 'inicio', 'início', 'voltar', 'reiniciar'].includes(textoLower);
        if (!isResetCommand) {
          console.log(`[RESET] Estado terminal "${etapaAtual}" recebeu mensagem relevante, reiniciando fluxo...`);
          // Reset to 'novo' and re-process by identifying client by phone
          etapaAtual = 'novo';
          dados = { mensagens_historico: dados.mensagens_historico || [] };

          // Re-run the 'novo' logic: find client by phone
          const phoneSuffix = telefone.slice(-10);
          const phoneSuffix11 = telefone.slice(-11);

          let devedoresReset: any[] = [];
          const { data: devPorTelReset } = await supabase
            .from('devedores')
            .select('nome, cpf, telefone, valor_atualizado, credor')
            .eq('ativo', true)
            .or(`telefone.ilike.%${phoneSuffix},telefone.ilike.%${phoneSuffix11}`);
          devedoresReset = devPorTelReset || [];

          if (devedoresReset.length === 0) {
            const { data: telsAdicionaisReset } = await supabase
              .from('devedor_telefones')
              .select('devedor_cpf, numero')
              .eq('ativo', true)
              .or(`numero.ilike.%${phoneSuffix},numero.ilike.%${phoneSuffix11}`);
            if (telsAdicionaisReset && telsAdicionaisReset.length > 0) {
              const cpfsUnicos = [...new Set(telsAdicionaisReset.map((t: any) => t.devedor_cpf))];
              const { data: devPorCpfReset } = await supabase
                .from('devedores')
                .select('nome, cpf, telefone, valor_atualizado, credor')
                .eq('ativo', true)
                .in('cpf', cpfsUnicos);
              if (devPorCpfReset) devedoresReset = devPorCpfReset;
            }
          }

          if (devedoresReset.length > 0) {
            const devedor = devedoresReset[0];
            const cpf = devedor.cpf.replace(/\D/g, '');
            const valorTotal = devedoresReset
              .filter((d: any) => d.cpf.replace(/\D/g, '') === cpf)
              .reduce((sum: number, d: any) => sum + Number(d.valor_atualizado), 0);
            const valorAvista = valorTotal * 0.5;
            const valorParcelado = valorTotal * 0.7;
            let maxParcelas = Math.floor(valorParcelado / VALOR_MINIMO_PARCELA);
            if (maxParcelas > 24) maxParcelas = 24;
            if (maxParcelas < 2) maxParcelas = 2;
            const credorNome = getCredorNome(devedor.credor || '');

            // Check if the message is a positive response (client saying "sim" to a proposal)
            const intencaoReset = await interpretarIntencao(texto, ['sim', 'nao']);
            const isSimReset = intencaoReset?.includes('sim') ||
              ['sim', 'consigo', 'sim consigo', 'quero', 'pode ser', 'sim como fica', 'aceito', 'quero sim', 'como fica'].includes(textoLower);

            if (isSimReset) {
              // Client is saying yes to the offer — show values directly
              const valorParcelaMin = valorParcelado / maxParcelas;
              resposta = `Que ótimo! Estamos com uma super oportunidade para você quitar todo débito em aberto pelo valor de *${formatCurrency(valorAvista)}*. Ou podemos parcelar para você em *${maxParcelas}x de ${formatCurrency(valorParcelaMin)}*. Como fica melhor para você?`;
              dados = {
                ...dados, cpf, nome: devedor.nome, valor_total: valorTotal,
                valor_avista: valorAvista, valor_parcelado: valorParcelado,
                max_parcelas: maxParcelas, credor: credorNome,
              };
              await salvarEResponder('oferta_valores');
              break;
            } else {
              // Not a clear "sim" — send the initial proposal
              const primeiroNome = devedor.nome.split(' ')[0];
              const primeiroNomeCap = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
              resposta = `Olá ${primeiroNomeCap}, você consegue voltar a pagar suas parcelas em aberto com ${credorNome} com 50% de desconto?`;
              dados = {
                ...dados, cpf, nome: devedor.nome, valor_total: valorTotal,
                valor_avista: valorAvista, valor_parcelado: valorParcelado,
                max_parcelas: maxParcelas, credor: credorNome,
              };
              await salvarEResponder('proposta_enviada');
              break;
            }
          }

          // No debtor found — ask for CPF
          resposta = `Olá! Para consultar sua situação, por favor me informe seu CPF.`;
          await salvarEResponder('aguardando_cpf');
          break;
        }

        resposta = `Para uma nova consulta, digite "menu". Para falar com um negociador: (62) 98218-3144.`;
        await salvarEResponder(etapaAtual);
        break;
      }

      default: {
        resposta = `Olá! Para consultar sua situação financeira, me informe seu CPF.`;
        await salvarEResponder('aguardando_cpf');
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro no whatsapp-chatbot:', error);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
