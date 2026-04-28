
CREATE TABLE public.chatbot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  template TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chatbot_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar templates"
ON public.chatbot_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read templates"
ON public.chatbot_templates FOR SELECT TO authenticated
USING (true);
