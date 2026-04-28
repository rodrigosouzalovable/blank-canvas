CREATE OR REPLACE FUNCTION public.consultar_parcelas_acordo_por_cpf(p_cpf text)
RETURNS TABLE(
  numero_parcela integer,
  valor_parcela numeric,
  data_prevista date,
  status text,
  data_paga date,
  total_parcelas integer,
  valor_total_acordo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acordo_id uuid;
  v_total_parcelas integer;
  v_valor_total numeric;
BEGIN
  SELECT a.id, a.parcelas, a.valor_total
  INTO v_acordo_id, v_total_parcelas, v_valor_total
  FROM acordos a
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(p_cpf)
    AND a.status IN ('ativo', 'concluido')
  ORDER BY a.criado_em DESC
  LIMIT 1;

  IF v_acordo_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.numero_parcela,
    p.valor_parcela,
    p.data_prevista,
    p.status,
    p.data_paga,
    v_total_parcelas,
    v_valor_total
  FROM pagamentos p
  WHERE p.acordo_id = v_acordo_id
  ORDER BY p.numero_parcela;
END;
$$;