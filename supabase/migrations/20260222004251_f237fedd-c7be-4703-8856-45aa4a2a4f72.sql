
-- Tabela para tokens de acesso dos credores ao dashboard executivo
CREATE TABLE public.credor_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credor_slug text UNIQUE NOT NULL,
  token text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: apenas admins podem gerenciar
ALTER TABLE public.credor_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar credor_tokens"
ON public.credor_tokens
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to credor_tokens"
ON public.credor_tokens
FOR ALL
USING (false)
WITH CHECK (false);
