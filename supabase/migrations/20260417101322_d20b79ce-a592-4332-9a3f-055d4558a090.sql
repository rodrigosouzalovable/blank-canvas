-- RPC: buscar devedores por documento usando índice cpf_normalize
CREATE OR REPLACE FUNCTION public.buscar_devedores_por_documento(
  p_doc text,
  p_credor text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  nome text,
  cpf text,
  credor text,
  contrato text,
  valor_original numeric,
  valor_atualizado numeric,
  estagio text,
  telefone text,
  data_vencimento date,
  descricao text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text;
BEGIN
  v_doc := regexp_replace(COALESCE(p_doc, ''), '[^0-9]', '', 'g');

  IF v_doc = '' THEN
    RETURN;
  END IF;

  IF length(v_doc) >= 11 THEN
    RETURN QUERY
    SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
           d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
           d.data_vencimento, d.descricao
    FROM public.devedores d
    WHERE d.ativo = true
      AND public.cpf_normalize(d.cpf) = v_doc
      AND (p_credor IS NULL OR p_credor = '' OR d.credor = p_credor)
    ORDER BY d.nome
    LIMIT 5000;
  ELSE
    RETURN QUERY
    SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
           d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
           d.data_vencimento, d.descricao
    FROM public.devedores d
    WHERE d.ativo = true
      AND public.cpf_normalize(d.cpf) LIKE v_doc || '%'
      AND (p_credor IS NULL OR p_credor = '' OR d.credor = p_credor)
    ORDER BY d.nome
    LIMIT 5000;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_devedores_por_documento(text, text) TO authenticated;

-- RPC: listar credores distintos em uma única query
CREATE OR REPLACE FUNCTION public.listar_credores_distintos()
RETURNS TABLE(credor text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT d.credor
  FROM public.devedores d
  WHERE d.ativo = true
    AND d.credor IS NOT NULL
    AND d.credor <> ''
  ORDER BY d.credor;
$$;

GRANT EXECUTE ON FUNCTION public.listar_credores_distintos() TO authenticated;