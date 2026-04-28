CREATE OR REPLACE FUNCTION public.contar_acordos_hoje()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM acordos
  WHERE criado_em >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;