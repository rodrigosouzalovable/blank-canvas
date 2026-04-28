
CREATE TABLE public.user_whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT,
  server_url TEXT NOT NULL,
  instance_token TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own instances"
  ON public.user_whatsapp_instances
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Deny anonymous access to user_whatsapp_instances"
  ON public.user_whatsapp_instances
  FOR ALL
  USING (false)
  WITH CHECK (false);
