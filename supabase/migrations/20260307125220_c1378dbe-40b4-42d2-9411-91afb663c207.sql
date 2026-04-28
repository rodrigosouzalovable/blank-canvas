
CREATE TABLE public.chatbot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id)
);

ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage chatbot config"
ON public.chatbot_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read chatbot config"
ON public.chatbot_config
FOR SELECT
TO authenticated
USING (true);

-- Insert default row (chatbot enabled)
INSERT INTO public.chatbot_config (ativo) VALUES (true);
