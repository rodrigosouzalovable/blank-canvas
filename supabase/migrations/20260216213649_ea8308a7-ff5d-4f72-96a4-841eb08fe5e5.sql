
-- Create devedor_telefones table
CREATE TABLE public.devedor_telefones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devedor_cpf text NOT NULL,
  numero text NOT NULL,
  tipo text NOT NULL DEFAULT 'celular',
  is_contato boolean DEFAULT false,
  is_whatsapp boolean DEFAULT false,
  ativo boolean DEFAULT true,
  autorizado boolean DEFAULT true,
  observacao text,
  ramal text,
  criado_por uuid NOT NULL,
  criado_em timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devedor_telefones ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins podem gerenciar telefones"
ON public.devedor_telefones
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view
CREATE POLICY "Usuarios autenticados podem ver telefones"
ON public.devedor_telefones
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert
CREATE POLICY "Usuarios autenticados podem criar telefones"
ON public.devedor_telefones
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = criado_por);

-- Authenticated users can update
CREATE POLICY "Usuarios autenticados podem atualizar telefones"
ON public.devedor_telefones
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Deny anonymous
CREATE POLICY "Deny anonymous access to devedor_telefones"
ON public.devedor_telefones
FOR ALL
USING (false)
WITH CHECK (false);

-- Index on CPF for fast lookups
CREATE INDEX idx_devedor_telefones_cpf ON public.devedor_telefones (devedor_cpf);
