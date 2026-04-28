
CREATE TABLE public.whatsapp_mensagens_rapidas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto',
  conteudo TEXT,
  audio_url TEXT,
  botoes_texto TEXT,
  botoes_choices JSONB,
  ordem INTEGER DEFAULT 0,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_mensagens_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mensagens_rapidas"
ON public.whatsapp_mensagens_rapidas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
