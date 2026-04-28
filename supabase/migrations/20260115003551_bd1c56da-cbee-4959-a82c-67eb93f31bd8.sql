-- Corrigir a função cpf_normalize para incluir search_path
CREATE OR REPLACE FUNCTION public.cpf_normalize(cpf_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN regexp_replace(COALESCE(cpf_input, ''), '[^0-9]', '', 'g');
END;
$$;