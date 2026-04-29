# Copiar componentes do projeto antigo para o novo

## Origem
Projeto **MEUS ACORDOS - RODRIGO** (`minhacomissao.lovable.app`) — único outro projeto na sua workspace.

## Destino
Este projeto (NOVO MEUS ACORDOS).

## O que será copiado (sobrescrevendo)

### Pastas inteiras
1. `src/components/negociacao/`
   - `DiscountTierSelector.tsx`
2. `src/components/devedor/`
   - `AcordoDevedorSection.tsx`
   - `CalculadoraDebitoDialog.tsx`
   - `TelefoneDialog.tsx`
   - `TelefoneTab.tsx`
3. `src/components/layout/`
   - `AppLayout.tsx`
   - `SortableNavItem.tsx`
4. `src/components/ui/` (49 arquivos shadcn — accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, loading-skeleton, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip, use-toast.ts)

### Arquivos soltos em `src/components/`
- `RankingMensal.tsx`
- `ComparativoMensal.tsx`
- `MetasMensal.tsx`
- `PaymentReminders.tsx`
- `RetornoAlertChecker.tsx`

Total: ~60 arquivos. Os arquivos do destino têm exatamente os mesmos nomes — sobrescrita 1:1, nenhum órfão.

## Como será feito
Para cada arquivo, uso `cross_project--read_project_file` (origem) → `code--write` (destino). Executo em lotes paralelos para acelerar.

## Observação importante sobre as abas "Negociados / Pagos / Vencidas"

Verifiquei `src/pages/Acordos.tsx` em ambos os projetos: têm o mesmo tamanho (~1267 linhas) e as abas já estão definidas no código atual. Se as abas continuarem "sumindo" depois desta cópia, o problema **não é arquivo faltando** — é provavelmente:

- Erro de runtime na query (tipos Supabase desatualizados após a migração — o `src/integrations/supabase/types.ts` precisa ser regenerado).
- Tabela/coluna com nome diferente no novo banco.
- RLS bloqueando o `SELECT`.

Posso investigar isso depois que a cópia terminar — me avise se as abas continuarem vazias e eu abro o console/network para diagnosticar.

## Não incluído (você não pediu, mas pode precisar depois)
- `src/components/inbox/`, `src/components/aquecimento/`, `src/components/monitor/` — pastas que existem no antigo e também aqui. Avise se quiser copiar também.
- Outros arquivos soltos como `EstrategiasCobranca.tsx`, `ChatHistoryDialog.tsx`, etc.
