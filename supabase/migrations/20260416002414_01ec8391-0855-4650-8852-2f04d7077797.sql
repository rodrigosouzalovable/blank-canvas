DROP FUNCTION IF EXISTS public.consultar_debitos_por_cpf(TEXT);

CREATE OR REPLACE FUNCTION public.consultar_debitos_por_cpf(p_cpf TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  cpf TEXT,
  valor_original NUMERIC,
  valor_atualizado NUMERIC,
  descricao TEXT,
  contrato TEXT,
  data_vencimento DATE,
  credor TEXT
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
    d.data_vencimento,
    d.credor
  FROM public.devedores d
  WHERE cpf_normalize(d.cpf) = cpf_normalize(p_cpf)
    AND d.ativo = true;
$$;