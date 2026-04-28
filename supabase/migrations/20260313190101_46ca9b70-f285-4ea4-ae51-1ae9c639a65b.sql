CREATE TABLE public.lembrete_mensagens_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo_lembrete text NOT NULL,
  mensagem text NOT NULL,
  ativo boolean DEFAULT true,
  ordem int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tipo_lembrete, ordem)
);

ALTER TABLE public.lembrete_mensagens_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON public.lembrete_mensagens_templates
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);