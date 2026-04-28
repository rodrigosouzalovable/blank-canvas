-- Função para verificar se o último acordo de um CPF tem QUEBRA DE ACORDO
-- (última parcela pendente vencida há mais de 10 dias)
CREATE OR REPLACE FUNCTION public.cpf_ultimo_acordo_quebrado(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultimo_acordo_id uuid;
  v_ultima_parcela_pendente date;
BEGIN
  -- Se CPF vazio/nulo, retorna FALSE
  IF p_cpf IS NULL OR cpf_normalize(p_cpf) = '' THEN
    RETURN false;
  END IF;

  -- Encontrar o acordo MAIS RECENTE com esse CPF
  SELECT id INTO v_ultimo_acordo_id
  FROM acordos
  WHERE cpf_normalize(cliente_cpf) = cpf_normalize(p_cpf)
  ORDER BY criado_em DESC
  LIMIT 1;
  
  -- Se não existe acordo, retorna FALSE
  IF v_ultimo_acordo_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Buscar a data da última parcela PENDENTE desse acordo
  SELECT MAX(data_prevista) INTO v_ultima_parcela_pendente
  FROM pagamentos
  WHERE acordo_id = v_ultimo_acordo_id
  AND status = 'pendente';
  
  -- Se não tem parcela pendente, não é quebra
  IF v_ultima_parcela_pendente IS NULL THEN
    RETURN false;
  END IF;
  
  -- Se a última parcela pendente está vencida há mais de 10 dias = QUEBRA
  RETURN v_ultima_parcela_pendente < CURRENT_DATE - INTERVAL '10 days';
END;
$$;

-- Atualizar o trigger para nova lógica de CPF duplicado
-- Agora permite criar acordo se o último acordo do CPF tem QUEBRA DE ACORDO
CREATE OR REPLACE FUNCTION public.acordos_block_duplicate_cpf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se CPF vazio/nulo, permitir
  IF NEW.cliente_cpf IS NULL OR cpf_normalize(NEW.cliente_cpf) = '' THEN
    RETURN NEW;
  END IF;
  
  -- Se admin, permitir sempre
  IF is_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;
  
  -- Se não existe acordo com esse CPF, permitir
  IF NOT EXISTS (
    SELECT 1 FROM acordos 
    WHERE cpf_normalize(cliente_cpf) = cpf_normalize(NEW.cliente_cpf)
    AND id IS DISTINCT FROM NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  
  -- CPF existe - verificar se último acordo tem QUEBRA DE ACORDO
  IF cpf_ultimo_acordo_quebrado(NEW.cliente_cpf) THEN
    -- Último acordo está quebrado, permitir novo
    RETURN NEW;
  END IF;
  
  -- CPF existe e último acordo NÃO está quebrado = BLOQUEIA
  RAISE EXCEPTION 'Este CPF já possui acordo ativo. Contate o administrador.';
END;
$$;