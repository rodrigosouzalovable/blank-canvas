CREATE OR REPLACE FUNCTION public.cpf_acordo_funcionario_nome(p_cpf text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nome text;
BEGIN
  SELECT p.nome INTO v_nome
  FROM acordos a
  JOIN profiles p ON p.id = a.user_id
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(p_cpf)
  ORDER BY a.criado_em DESC
  LIMIT 1;

  RETURN v_nome;
END;
$$;