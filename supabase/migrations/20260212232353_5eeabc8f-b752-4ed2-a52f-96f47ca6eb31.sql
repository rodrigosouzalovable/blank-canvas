
-- Tabela de devedores
CREATE TABLE public.devedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  valor_original NUMERIC NOT NULL DEFAULT 0,
  valor_atualizado NUMERIC NOT NULL DEFAULT 0,
  descricao TEXT,
  contrato TEXT,
  data_vencimento DATE,
  importado_por UUID,
  arquivo_importacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice no CPF normalizado
CREATE INDEX idx_devedores_cpf ON public.devedores (cpf_normalize(cpf));

-- Trigger para atualizar timestamp
CREATE TRIGGER update_devedores_updated_at
  BEFORE UPDATE ON public.devedores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.devedores ENABLE ROW LEVEL SECURITY;

-- Política: bloquear acesso anônimo direto
CREATE POLICY "Deny direct anonymous access to devedores"
  ON public.devedores FOR ALL
  USING (false)
  WITH CHECK (false);

-- Política: admins podem fazer tudo
CREATE POLICY "Admins podem gerenciar devedores"
  ON public.devedores FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Função SECURITY DEFINER para consulta pública por CPF
CREATE OR REPLACE FUNCTION public.consultar_debitos_por_cpf(p_cpf TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  cpf TEXT,
  valor_original NUMERIC,
  valor_atualizado NUMERIC,
  descricao TEXT,
  contrato TEXT,
  data_vencimento DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    d.id,
    d.nome,
    d.cpf,
    d.valor_original,
    d.valor_atualizado,
    d.descricao,
    d.contrato,
    d.data_vencimento
  FROM public.devedores d
  WHERE cpf_normalize(d.cpf) = cpf_normalize(p_cpf)
    AND d.ativo = true;
$$;
