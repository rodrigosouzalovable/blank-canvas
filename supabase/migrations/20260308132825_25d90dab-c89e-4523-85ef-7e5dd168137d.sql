
CREATE TABLE public.chatbot_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gatilho TEXT NOT NULL,
  resposta TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chatbot_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar regras"
ON public.chatbot_regras FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
