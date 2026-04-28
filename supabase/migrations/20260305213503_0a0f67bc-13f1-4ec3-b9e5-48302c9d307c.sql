
CREATE TABLE public.chatbot_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  etapa text NOT NULL DEFAULT 'aguardando_cpf',
  dados jsonb DEFAULT '{}'::jsonb,
  instance_token text,
  server_url text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(telefone)
);

ALTER TABLE public.chatbot_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access chatbot_conversas"
  ON public.chatbot_conversas FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Admins podem ver chatbot_conversas"
  ON public.chatbot_conversas FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
