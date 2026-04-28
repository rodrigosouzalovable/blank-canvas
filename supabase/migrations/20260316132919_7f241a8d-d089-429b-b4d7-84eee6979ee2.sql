CREATE OR REPLACE FUNCTION public.delete_acordo_atomico(p_acordo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM pagamentos WHERE acordo_id = p_acordo_id;
  DELETE FROM acordos WHERE id = p_acordo_id;
END;
$$;