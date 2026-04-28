-- 1) Função para normalizar CPF (remover caracteres especiais)
CREATE OR REPLACE FUNCTION public.cpf_normalize(cpf_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN regexp_replace(COALESCE(cpf_input, ''), '[^0-9]', '', 'g');
END;
$$;

-- 2) Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin_user(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$;

-- 3) Função RPC para verificar se CPF já possui acordo (usada pelo frontend)
CREATE OR REPLACE FUNCTION public.cpf_has_acordo(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM acordos 
    WHERE cpf_normalize(cliente_cpf) = cpf_normalize(p_cpf)
  );
END;
$$;

-- Permitir que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION public.cpf_has_acordo(text) TO authenticated;

-- 4) Trigger function para bloquear CPF duplicado (exceto admin)
CREATE OR REPLACE FUNCTION public.acordos_block_duplicate_cpf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se CPF estiver vazio ou nulo, permitir
  IF NEW.cliente_cpf IS NULL OR cpf_normalize(NEW.cliente_cpf) = '' THEN
    RETURN NEW;
  END IF;
  
  -- Se for admin, permitir duplicados
  IF is_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;
  
  -- Verificar se existe outro acordo com o mesmo CPF
  IF EXISTS (
    SELECT 1 FROM acordos 
    WHERE cpf_normalize(cliente_cpf) = cpf_normalize(NEW.cliente_cpf)
    AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Este CPF já possui acordo. Contate o administrador.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5) Criar trigger na tabela acordos
DROP TRIGGER IF EXISTS check_duplicate_cpf ON public.acordos;
CREATE TRIGGER check_duplicate_cpf
  BEFORE INSERT OR UPDATE OF cliente_cpf ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.acordos_block_duplicate_cpf();