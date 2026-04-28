-- Índices para melhorar performance nas queries mais frequentes

-- Índice para filtrar acordos por status (muito usado em listagens)
CREATE INDEX IF NOT EXISTS idx_acordos_status ON public.acordos(status);

-- Índice para filtrar acordos por user_id (usado em todas as queries RLS)
CREATE INDEX IF NOT EXISTS idx_acordos_user_id ON public.acordos(user_id);

-- Índice composto para acordos (user_id + status) - otimiza queries de listagem
CREATE INDEX IF NOT EXISTS idx_acordos_user_status ON public.acordos(user_id, status);

-- Índice para pagamentos por status
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos(status);

-- Índice para pagamentos por data prevista (usado em lembretes)
CREATE INDEX IF NOT EXISTS idx_pagamentos_data_prevista ON public.pagamentos(data_prevista);

-- Índice composto para pagamentos (acordo_id + status) - otimiza filtros
CREATE INDEX IF NOT EXISTS idx_pagamentos_acordo_status ON public.pagamentos(acordo_id, status);

-- Índice para team_members por gestor_id (usado em queries de equipe)
CREATE INDEX IF NOT EXISTS idx_team_members_gestor_id ON public.team_members(gestor_id);

-- Índice para team_members por funcionario_id
CREATE INDEX IF NOT EXISTS idx_team_members_funcionario_id ON public.team_members(funcionario_id);