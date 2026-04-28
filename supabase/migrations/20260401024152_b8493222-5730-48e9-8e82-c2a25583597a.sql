
-- Tabela de controle de aquecimento por instância
CREATE TABLE public.whatsapp_aquecimento_instancias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id UUID NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'INATIVO',
  fase INTEGER NOT NULL DEFAULT 1,
  dias_na_fase INTEGER NOT NULL DEFAULT 0,
  interacoes_hoje INTEGER NOT NULL DEFAULT 0,
  interacoes_total INTEGER NOT NULL DEFAULT 0,
  respostas_recebidas INTEGER NOT NULL DEFAULT 0,
  limite_diario INTEGER NOT NULL DEFAULT 5,
  ultima_interacao TIMESTAMPTZ,
  ultimo_aviso_falha TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instancia_id)
);

-- Tabela de log de interações de aquecimento
CREATE TABLE public.whatsapp_aquecimento_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_origem_id UUID NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  instancia_destino_id UUID NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  conteudo TEXT,
  conteudo_resposta TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  mensagem_id VARCHAR(100),
  enviado_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ,
  respondido_em TIMESTAMPTZ,
  tempo_resposta_segundos INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de pool de diálogos para aquecimento
CREATE TABLE public.whatsapp_aquecimento_dialogos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(20) NOT NULL,
  conteudo TEXT NOT NULL,
  conteudo_resposta_esperada TEXT,
  fase_minima INTEGER NOT NULL DEFAULT 1,
  tags TEXT[],
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de configurações globais de aquecimento
CREATE TABLE public.whatsapp_aquecimento_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(50) UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de agendamentos
CREATE TABLE public.whatsapp_aquecimento_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_origem_id UUID NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  instancia_destino_id UUID NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  interacao_id UUID REFERENCES public.whatsapp_aquecimento_interacoes(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL,
  conteudo TEXT,
  agendado_para TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AGENDADO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers para updated_at
CREATE TRIGGER update_aquecimento_instancias_updated_at
  BEFORE UPDATE ON public.whatsapp_aquecimento_instancias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aquecimento_config_updated_at
  BEFORE UPDATE ON public.whatsapp_aquecimento_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_aquecimento_instancias_status ON public.whatsapp_aquecimento_instancias(status);
CREATE INDEX idx_aquecimento_interacoes_status ON public.whatsapp_aquecimento_interacoes(status);
CREATE INDEX idx_aquecimento_interacoes_origem ON public.whatsapp_aquecimento_interacoes(instancia_origem_id);
CREATE INDEX idx_aquecimento_interacoes_destino ON public.whatsapp_aquecimento_interacoes(instancia_destino_id);
CREATE INDEX idx_aquecimento_agendamentos_agendado ON public.whatsapp_aquecimento_agendamentos(agendado_para) WHERE status = 'AGENDADO';

-- RLS
ALTER TABLE public.whatsapp_aquecimento_instancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_aquecimento_interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_aquecimento_dialogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_aquecimento_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_aquecimento_agendamentos ENABLE ROW LEVEL SECURITY;

-- Admin full access policies
CREATE POLICY "Admins gerenciam aquecimento_instancias" ON public.whatsapp_aquecimento_instancias FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins gerenciam aquecimento_interacoes" ON public.whatsapp_aquecimento_interacoes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins gerenciam aquecimento_dialogos" ON public.whatsapp_aquecimento_dialogos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins gerenciam aquecimento_config" ON public.whatsapp_aquecimento_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins gerenciam aquecimento_agendamentos" ON public.whatsapp_aquecimento_agendamentos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Deny anon
CREATE POLICY "Deny anon aquecimento_instancias" ON public.whatsapp_aquecimento_instancias FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon aquecimento_interacoes" ON public.whatsapp_aquecimento_interacoes FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon aquecimento_dialogos" ON public.whatsapp_aquecimento_dialogos FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon aquecimento_config" ON public.whatsapp_aquecimento_config FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon aquecimento_agendamentos" ON public.whatsapp_aquecimento_agendamentos FOR ALL TO anon USING (false) WITH CHECK (false);
