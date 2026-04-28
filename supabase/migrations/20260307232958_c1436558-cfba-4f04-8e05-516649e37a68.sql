
CREATE TABLE public.chat_ia_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  image text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_ia_mensagens_user_id ON public.chat_ia_mensagens(user_id);

ALTER TABLE public.chat_ia_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages"
  ON public.chat_ia_mensagens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON public.chat_ia_mensagens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON public.chat_ia_mensagens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
