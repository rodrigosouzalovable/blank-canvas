
-- Update cpf_ultimo_acordo_quebrado to also check status = 'quebrado'
CREATE OR REPLACE FUNCTION public.cpf_ultimo_acordo_quebrado(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ultimo_acordo record;
BEGIN
  -- Se CPF vazio/nulo, retorna FALSE
  IF p_cpf IS NULL OR cpf_normalize(p_cpf) = '' THEN
    RETURN false;
  END IF;

  -- Encontrar o acordo MAIS RECENTE com esse CPF
  SELECT id, status INTO v_ultimo_acordo
  FROM acordos
  WHERE cpf_normalize(cliente_cpf) = cpf_normalize(p_cpf)
  ORDER BY criado_em DESC
  LIMIT 1;
  
  -- Se não existe acordo, retorna FALSE
  IF v_ultimo_acordo IS NULL THEN
    RETURN false;
  END IF;
  
  -- Se o status do acordo é 'quebrado', retorna TRUE diretamente
  IF v_ultimo_acordo.status = 'quebrado' THEN
    RETURN true;
  END IF;
  
  -- Caso contrário, verificar pela lógica de parcelas pendentes vencidas há mais de 10 dias
  DECLARE
    v_ultima_parcela_pendente date;
  BEGIN
    SELECT MAX(data_prevista) INTO v_ultima_parcela_pendente
    FROM pagamentos
    WHERE acordo_id = v_ultimo_acordo.id
    AND status = 'pendente';
    
    IF v_ultima_parcela_pendente IS NULL THEN
      RETURN false;
    END IF;
    
    RETURN v_ultima_parcela_pendente < CURRENT_DATE - INTERVAL '10 days';
  END;
END;
$function$;
