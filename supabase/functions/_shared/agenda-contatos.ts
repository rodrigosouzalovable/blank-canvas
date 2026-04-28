// Utilitário compartilhado para salvar contatos na agenda física do dispositivo via UAZAPI.
// Usa cache em whatsapp_contatos_agenda_salvos para evitar chamadas repetidas.

export function nomeAmigavelInstancia(nomeInstancia: string | null | undefined, telefone: string): string {
  if (!nomeInstancia) return `Contato ${telefone}`;
  // Remove prefixo numérico ex: "62982458447 CERTIFICADORA CNPJ" -> "CERTIFICADORA CNPJ"
  const semPrefixo = nomeInstancia.replace(/^\d+\s*/, '').trim();
  if (semPrefixo.length >= 2) return semPrefixo;
  return `Contato ${telefone}`;
}

export function normalizarNumero(numero: string): string {
  const limpo = String(numero || '').replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : `55${limpo}`;
}

async function chamarUazapiSalvar(baseUrl: string, token: string, numero: string, nome: string): Promise<boolean> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const jid = `${numero}@s.whatsapp.net`;
  const endpoints = [
    `${cleanUrl}/contact/add`,
    `${cleanUrl}/contacts/add`,
    `${cleanUrl}/contact/upsert`,
    `${cleanUrl}/contacts/upsert`,
  ];
  const payloads = [
    { number: numero, name: nome },
    { number: jid, name: nome },
    { jid, name: nome },
    { phone: numero, name: nome },
  ];

  for (const url of endpoints) {
    for (const payload of payloads) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            token,
          },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res.ok) return true;
      } catch (_) { /* tenta próximo */ }
    }
  }
  return false;
}

/**
 * Salva contato na agenda física do dispositivo se ainda não foi salvo (cache).
 * Retorna true se foi salvo agora ou já estava no cache.
 */
export async function salvarContatoAgendaCacheado(
  supabase: any,
  instanciaId: string,
  serverUrl: string,
  instanceToken: string,
  numero: string,
  nome: string,
): Promise<{ ok: boolean; cached: boolean; salvo: boolean }> {
  const numeroLimpo = normalizarNumero(numero);
  if (!numeroLimpo || !serverUrl || !instanceToken || !instanciaId) {
    return { ok: false, cached: false, salvo: false };
  }

  // Verifica cache
  const { data: existente } = await supabase
    .from('whatsapp_contatos_agenda_salvos')
    .select('numero_destino')
    .eq('instancia_id', instanciaId)
    .eq('numero_destino', numeroLimpo)
    .maybeSingle();

  if (existente) {
    return { ok: true, cached: true, salvo: false };
  }

  const nomeFinal = (nome && nome.trim().length >= 2) ? nome.trim().substring(0, 60) : `Contato ${numeroLimpo}`;
  const ok = await chamarUazapiSalvar(serverUrl, instanceToken, numeroLimpo, nomeFinal);

  if (ok) {
    await supabase.from('whatsapp_contatos_agenda_salvos').upsert({
      instancia_id: instanciaId,
      numero_destino: numeroLimpo,
      nome_salvo: nomeFinal,
      salvo_em: new Date().toISOString(),
    }, { onConflict: 'instancia_id,numero_destino' });
    return { ok: true, cached: false, salvo: true };
  }

  return { ok: false, cached: false, salvo: false };
}
