## Objetivo

Replicar **integralmente** o código do projeto antigo `MEUS ACORDOS - RODRIGO` (id `e157f9b2-2af4-4db6-924f-25fd94a375b9`) para este novo projeto, sobrescrevendo o que existir hoje.

## Escopo da cópia

**1. Código fonte (`src/`)** — copiar e sobrescrever tudo:
- `src/pages/` — 34 páginas (Acionamento, Acordos, AdminEquipes, AdminUsuarios, Antifraude, Aquecimento, Auditoria, Auth, AutomacaoCobMais, CampanhasVoz, Clientes, Comissoes, ConsultaResultado, CredorDashboard, Dashboard, DevedorDetalhe, EditarAcordo, EquipeAcordos, ExportarDados, Financeiro, ImportarDevedores, Index, MetaPessoal, MinhaConta, MonitorEnvios, NotFound, NovoAcordo, NovoAcordoAdmin, PoliticaPrivacidade, PortalConsulta, Retornos, UsuarioComissoes, WhatsAppInbox, AcordoDetalhe)
- `src/components/` — pastas `aquecimento/`, `devedor/`, `inbox/`, `layout/`, `monitor/`, `negociacao/`, `ui/` + 21 componentes raiz (ChatHistoryDialog, PaymentReminders, RankingMensal, ComparativoMensal, MetasMensal, RetornoAlertChecker, etc.)
- `src/hooks/` — 9 hooks (useAuth, useUserRole, useUserPermissions, usePaymentReminders, useAudioRecorder, useAutoSend, useMonitorEnvios, use-mobile, use-toast)
- `src/contexts/`, `src/lib/`, `src/assets/`
- `src/App.tsx`, `src/App.css`, `src/index.css`, `src/main.tsx`, `src/vite-env.d.ts`
- **NÃO** sobrescrever `src/integrations/supabase/client.ts` nem `types.ts` (usam credenciais e schema deste projeto novo)

**2. `public/`** — favicon.ico, favicon.png, placeholder.svg, robots.txt

**3. Configurações raiz:**
- `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `eslint.config.js`
- **NÃO** copiar `.env` (já está populado automaticamente com as credenciais do Supabase deste projeto)

**4. Edge Functions (`supabase/functions/`)** — 51 funções + pasta `_shared/`. Lista completa: add-to-warming-group, analyze-cobmais-screen, aquecimento-envio-autosave, aquecimento-promocao-fase, aquecimento-sync-contatos-agenda, automacao-cobmais, backfill-instance-phones, chat-cobmais-knowledge, check-payment-reminders, check-whatsapp-numbers, cleanup-acordos, cleanup-inbox-media, consultar-indices, create-user-admin, credor-dashboard-data, credor-report-whatsapp, daily-report-advanced, daily-report-aquecimento, daily-report-whatsapp, delete-user-admin, delete-whatsapp-message, diagnose-webhooks, extract-acordo-data, extract-pdf-acordo, extract-texto-acordo, fetch-whatsapp-history, gerar-estrategia-cobranca, gerar-termo-acordo, notify-cpf-consulta, process-acionamento-agendado, process-cobmais-video, process-import-job, process-pos-atendimento, process-whatsapp-queue, reset-user-password, send-whatsapp, send-whatsapp-audio, send-whatsapp-buttons, send-whatsapp-media, teach-chatbot, test-uazapi-connection, transcribe-audio, uazapi-disable-group-webhooks, voice-campaign-call, whatsapp-aquecimento, whatsapp-chatbot, whatsapp-ia-responder, whatsapp-mentor, whatsapp-qr.

**5. Dependências:** `bun install` após copiar `package.json`. As edge functions são deployadas automaticamente.

## Pontos de atenção (importantes)

1. **Schema do banco**: o projeto novo já recebeu várias migrações (enums, RPCs, FKs) nas etapas anteriores. Quando o código copiado chamar tabelas/colunas/RPCs/enums que **ainda não existem** neste projeto, o build/runtime quebrará. Após a cópia, precisarei comparar o schema antigo com o atual e gerar migrações complementares (criação de tabelas faltantes, colunas, RPCs, triggers, RLS).

2. **Secrets das Edge Functions**: o projeto antigo provavelmente usa secrets como `UAZAPI_TOKEN`, `OPENAI_API_KEY`, `RESEND_API_KEY`, etc. Hoje este projeto só tem secrets básicos do Supabase + `LOVABLE_API_KEY`. Após o deploy, funções que dependem de secrets ausentes falharão até você fornecê-los. Vou listar quais faltam ao final.

3. **Storage buckets**: o projeto antigo pode usar buckets (áudios, mídia inbox, etc.). Este projeto não tem nenhum. Se o código os referenciar, criarei migrações para os buckets.

4. **Volume**: ~150+ arquivos. A cópia será feita em paralelo via `cross_project--copy_project_asset` em lotes.

## Plano de execução

1. Copiar todos os arquivos `src/` (exceto `integrations/supabase/`), `public/`, configs raiz e `index.html`.
2. Restaurar pós-cópia os imports/credenciais de `src/integrations/supabase/client.ts` para apontar ao Supabase deste projeto.
3. Copiar todas as 51 edge functions + `_shared/`.
4. Rodar `bun install` para sincronizar dependências.
5. Rodar o linter Supabase e identificar tabelas/RPCs/enums/buckets faltantes; gerar migração consolidada.
6. Reportar lista de secrets que precisam ser adicionados manualmente para as edge functions funcionarem.

## O que NÃO será feito automaticamente

- Adicionar secrets de terceiros (uazapi, openai, resend, etc.) — você precisará informar os valores quando eu solicitar.
- Sobrescrever credenciais Supabase do projeto novo.
- Recriar instâncias de WhatsApp (você confirmou que já estão no banco).

Aprove para eu executar.