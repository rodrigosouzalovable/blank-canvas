
CREATE TABLE public.mentor_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mentor_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mentor messages"
ON public.mentor_conversas FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mentor messages"
ON public.mentor_conversas FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mentor messages"
ON public.mentor_conversas FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_mentor_conversas_user_id ON public.mentor_conversas(user_id, criado_em);
