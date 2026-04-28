
-- Table: automacao_config
CREATE TABLE public.automacao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_url text NOT NULL DEFAULT '',
  cobmais_email text NOT NULL DEFAULT '',
  cobmais_senha text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'offline',
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.automacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar automacao_config"
  ON public.automacao_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to automacao_config"
  ON public.automacao_config FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Table: automacao_comandos
CREATE TABLE public.automacao_comandos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  acao text NOT NULL,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  resultado jsonb,
  erro text,
  tempo_execucao_ms integer,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  executado_em timestamp with time zone
);

ALTER TABLE public.automacao_comandos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar automacao_comandos"
  ON public.automacao_comandos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to automacao_comandos"
  ON public.automacao_comandos FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Table: automacao_logs
CREATE TABLE public.automacao_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comando_id uuid REFERENCES public.automacao_comandos(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'info',
  mensagem text NOT NULL DEFAULT '',
  detalhes jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.automacao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar automacao_logs"
  ON public.automacao_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to automacao_logs"
  ON public.automacao_logs FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
