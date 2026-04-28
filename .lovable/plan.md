## Resumo

Substituir 100% as chamadas Ollama/Gemini no aquecimento por um motor de diálogo baseado em pool curado de mensagens no banco. Zero IA, zero túnel, zero bloqueio. O ping-pong passa a ser orquestrado por palavras-chave (gatilhos), respostas coringa e encerramentos progressivos.

---

## 1. Migration: `whatsapp_dialogos_pool`

```sql
CREATE TABLE public.whatsapp_dialogos_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'texto',           -- texto | audio | imagem (futuro)
  contexto text NOT NULL,                       -- inicial | resposta | coringa | encerramento
  gatilho text[] DEFAULT '{}',                  -- palavras-chave (apenas p/ contexto=resposta)
  resposta text NOT NULL,
  fase_minima int NOT NULL DEFAULT 1,           -- só usada se instância >= fase_minima
  peso int NOT NULL DEFAULT 1,                  -- ponderação no sorteio
  vezes_utilizada int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialogos_contexto_ativo
  ON public.whatsapp_dialogos_pool (contexto, ativo, fase_minima);
CREATE INDEX idx_dialogos_gatilho_gin
  ON public.whatsapp_dialogos_pool USING GIN (gatilho);

ALTER TABLE public.whatsapp_dialogos_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_dialogos" ON public.whatsapp_dialogos_pool
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- Tabela de controle anti-repetição (resposta x destino, janela 24h)
CREATE TABLE public.whatsapp_dialogos_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogo_id uuid NOT NULL REFERENCES public.whatsapp_dialogos_pool(id) ON DELETE CASCADE,
  numero_destino text NOT NULL,
  usado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dialogos_uso_dest_time
  ON public.whatsapp_dialogos_uso (numero_destino, usado_em DESC);

-- Purga 48h
SELECT cron.schedule(
  'purge-dialogos-uso',
  '15 6 * * *',
  $$ DELETE FROM public.whatsapp_dialogos_uso WHERE usado_em < now() - interval '48 hours'; $$
);
```

Seed inicial (~50 linhas) exatamente como você descreveu: 11 saudações iniciais, blocos de respostas com gatilhos (`tudo bem`, `fazendo/trabalhando`, `legal/bom`, `obrigado/valeu`, `sei não`), 10 coringas, 5 encerramentos.

---

## 2. Reescrita: `supabase/functions/whatsapp-ia-responder/index.ts`

Manter toda a infraestrutura existente (auditoria, typing indicator, envio UAZAPI, log no inbox, helpers de mídia, controle de cooldown, salvar contato). **Remover** apenas:

- `callOllama()`, `OLLAMA_*`, prompts, `TEMAS_CONVERSA`, `FALLBACK_RESPOSTAS`, `buildSystemPrompt()`.

**Adicionar** motor de diálogo:

```ts
// Sorteio ponderado in-memory
function sorteioPonderado<T extends { peso: number }>(itens: T[]): T {
  const total = itens.reduce((s, i) => s + Math.max(1, i.peso), 0);
  let r = Math.random() * total;
  for (const i of itens) { r -= Math.max(1, i.peso); if (r <= 0) return i; }
  return itens[itens.length - 1];
}

function normalizar(t: string) {
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

async function gerarMensagemInicialPool(sb, fase: number): Promise<string> {
  const { data } = await sb.from('whatsapp_dialogos_pool')
    .select('id,resposta,peso')
    .eq('contexto', 'inicial').eq('ativo', true).lte('fase_minima', fase);
  if (!data?.length) return 'Oi! Tudo bem?';
  const escolhido = sorteioPonderado(data);
  await sb.from('whatsapp_dialogos_pool').update({ vezes_utilizada: (escolhido.vezes_utilizada ?? 0) + 1 }).eq('id', escolhido.id);
  return escolhido.resposta;
}

async function gerarRespostaPool(sb, mensagem: string, fase: number, totalTrocas: number, maxTrocas: number, numeroDestino: string): Promise<string> {
  // 1) Encerramento progressivo
  if (totalTrocas >= maxTrocas - 1) {
    const { data } = await sb.from('whatsapp_dialogos_pool')
      .select('id,resposta,peso').eq('contexto', 'encerramento').eq('ativo', true).lte('fase_minima', fase);
    if (data?.length) return registrarUso(sb, sorteioPonderado(data), numeroDestino);
  }

  // 2) Match por gatilho (overlap com palavras normalizadas)
  const tokens = normalizar(mensagem).split(/\s+/).filter(Boolean);
  const { data: respostas } = await sb.from('whatsapp_dialogos_pool')
    .select('id,resposta,peso,gatilho,vezes_utilizada')
    .eq('contexto', 'resposta').eq('ativo', true).lte('fase_minima', fase)
    .overlaps('gatilho', tokens);

  // Filtra repetições recentes para o mesmo destino (24h)
  const candidatos = await filtrarSemRepetir(sb, respostas ?? [], numeroDestino);
  if (candidatos.length) return registrarUso(sb, sorteioPonderado(candidatos), numeroDestino);

  // 3) Coringa
  const { data: coringas } = await sb.from('whatsapp_dialogos_pool')
    .select('id,resposta,peso,vezes_utilizada')
    .eq('contexto', 'coringa').eq('ativo', true).lte('fase_minima', fase);
  const cands = await filtrarSemRepetir(sb, coringas ?? [], numeroDestino);
  if (cands.length) return registrarUso(sb, sorteioPonderado(cands), numeroDestino);

  return 'Ah legal!';
}
```

`registrarUso()` insere em `whatsapp_dialogos_uso` e incrementa `vezes_utilizada`. `filtrarSemRepetir()` consulta os `dialogo_id` usados nas últimas 24h para aquele destino e remove da lista.

**Probabilidade de responder por fase** (aplicada antes de gerar):
```ts
const PROB_RESPOSTA = { 1: 0.6, 2: 0.8 }; // 3+ → 0.95
const prob = PROB_RESPOSTA[fase] ?? 0.95;
if (Math.random() > prob) {
  await auditar({ etapa: 'cascade_skip', status: 'ignorado', motivo: `prob_skip_fase_${fase}`, ... });
  return; // não responde, encerra cascata silenciosamente
}
```

A auditoria continua: `etapa='ollama_call'` é trocada por `etapa='ollama_call', status='ok', motivo='pool'` para preservar o dashboard atual sem migration extra.

---

## 3. Ajustes em `whatsapp-aquecimento/index.ts`

- Onde hoje chama o gerador inicial via Ollama, passar a usar `gerarMensagemInicialPool(sb, fase)`.
- Manter `PARES_POR_FASE` (1/2/3/5/8), cooldown 2-4h por par, `MAX_PAIRS_PER_CYCLE`, pausa 12-14h.
- Adicionar config de `MAX_TROCAS_CONVERSA = 6` (range 5-7 sorteado por par).

---

## 4. Limpeza

- Deletar `supabase/functions/diag-ollama/index.ts` (não tem mais função).
- Manter os secrets `OLLAMA_*` no projeto (não removo pelo agent), apenas paro de ler.
- `whatsapp-chatbot/index.ts` segue inalterado (apenas auditoria de webhook_in já feita).

---

## 5. Validação pós-deploy

1. Disparar `whatsapp-aquecimento` com `action: "manual-test"` em 2 chips.
2. Aguardar 90s.
3. Query: `SELECT etapa, status, motivo, resposta_gerada, created_at FROM whatsapp_conversas_auditoria ORDER BY created_at DESC LIMIT 30;`
4. Esperado: 0 falhas Ollama, todas as etapas `uazapi_send` com `status=ok`, ping-pong de 5-7 trocas terminando em `encerramento`.

---

## Custos e impacto

- Lovable Cloud: tabela pool < 1MB, tabela uso < 5MB com purga diária. **Zero custo IA.**
- Latência: resposta vira ~50-150ms (1 query) em vez de 2-30s (Ollama).
- Risco: respostas mais previsíveis se o pool for pequeno. **Mitigação:** o anti-repetição 24h + ponderação evita padrões óbvios; pool é facilmente expansível via SQL.

---

## Memória a atualizar

- Substituir `mem://features/whatsapp/warming-system-comprehensive`: gerador IA removido, agora pool curado em `whatsapp_dialogos_pool`.
- Nova memória `mem://features/whatsapp/warming/dialogos-pool`: estrutura da tabela, contextos, regras de gatilho/coringa/encerramento, probabilidade por fase.

---

## Arquivos alterados

- **migration nova** `whatsapp_dialogos_pool.sql` (tabelas + seed + cron)
- `supabase/functions/whatsapp-ia-responder/index.ts` (reescrita parcial: motor de pool)
- `supabase/functions/whatsapp-aquecimento/index.ts` (~10 linhas: troca chamada inicial)
- delete: `supabase/functions/diag-ollama/index.ts`
- `mem://index.md` + nova memória do pool