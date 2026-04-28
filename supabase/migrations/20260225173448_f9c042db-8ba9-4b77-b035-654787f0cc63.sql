
CREATE TABLE public.user_whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'uazapi',
  server_url TEXT NOT NULL,
  instance_token TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own config"
  ON public.user_whatsapp_config
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
