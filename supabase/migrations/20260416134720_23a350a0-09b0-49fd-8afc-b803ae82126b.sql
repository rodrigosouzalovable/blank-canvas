
CREATE OR REPLACE FUNCTION acordos_block_duplicate_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_funcionario TEXT;
  v_permite_duplicado BOOLEAN;
BEGIN
  IF NEW.cliente_cpf IS NULL OR cpf_normalize(NEW.cliente_cpf) = '' THEN
    RETURN NEW;
  END IF;
  
  IF is_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Check if user has permite_cpf_duplicado permission
  SELECT permite_cpf_duplicado INTO v_permite_duplicado
  FROM user_permissions
  WHERE user_id = auth.uid();

  IF v_permite_duplicado IS TRUE THEN
    RETURN NEW;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM acordos 
    WHERE cpf_normalize(cliente_cpf) = cpf_normalize(NEW.cliente_cpf)
    AND id IS DISTINCT FROM NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  
  IF cpf_ultimo_acordo_quebrado(NEW.cliente_cpf) THEN
    RETURN NEW;
  END IF;
  
  SELECT p.nome INTO v_nome_funcionario
  FROM acordos a
  JOIN profiles p ON p.id = a.user_id
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(NEW.cliente_cpf)
  AND a.id IS DISTINCT FROM NEW.id
  ORDER BY a.criado_em DESC
  LIMIT 1;
  
  RAISE EXCEPTION 'Este CPF já possui acordo lançado por %', COALESCE(v_nome_funcionario, 'outro funcionário');
END;
$$;
