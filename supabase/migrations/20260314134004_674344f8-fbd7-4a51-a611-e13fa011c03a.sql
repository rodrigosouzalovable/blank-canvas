
CREATE TABLE public.lembrete_envio_progresso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pagamento_id text NOT NULL,
  cliente_nome text,
  cliente_telefone text,
  status text NOT NULL DEFAULT 'pendente',
  erro_mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  data_envio date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.lembrete_envio_progresso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own lembrete_envio_progresso"
ON public.lembrete_envio_progresso
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_lembrete_envio_progresso_user_date ON public.lembrete_envio_progresso(user_id, data_envio);
