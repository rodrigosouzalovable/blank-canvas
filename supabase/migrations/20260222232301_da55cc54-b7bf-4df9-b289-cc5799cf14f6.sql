CREATE OR REPLACE FUNCTION public.consultar_acordo_ativo_por_cpf(p_cpf text)
RETURNS TABLE(
  acordo_status text,
  acordo_criado_em timestamptz,
  funcionario_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.status,
    a.criado_em,
    p.nome
  FROM acordos a
  JOIN profiles p ON p.id = a.user_id
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(p_cpf)
    AND a.status IN ('ativo', 'concluido')
  ORDER BY a.criado_em DESC
  LIMIT 1;
END;
$$;