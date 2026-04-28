-- Tabela para rastrear lembretes de pagamento lidos/dispensados
CREATE TABLE public.lembretes_lidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pagamento_id uuid NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, pagamento_id)
);

-- Enable RLS
ALTER TABLE public.lembretes_lidos ENABLE ROW LEVEL SECURITY;

-- Bloquear acesso anônimo
CREATE POLICY "Deny anonymous access to lembretes_lidos"
ON public.lembretes_lidos
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

-- Usuários podem ver seus próprios lembretes lidos
CREATE POLICY "Usuários podem ver seus lembretes lidos"
ON public.lembretes_lidos
FOR SELECT
USING (auth.uid() = user_id);

-- Usuários podem marcar lembretes como lidos
CREATE POLICY "Usuários podem criar lembretes lidos"
ON public.lembretes_lidos
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Usuários podem desmarcar lembretes
CREATE POLICY "Usuários podem deletar seus lembretes lidos"
ON public.lembretes_lidos
FOR DELETE
USING (auth.uid() = user_id);