
CREATE OR REPLACE FUNCTION public.contar_acordos_hoje_por_usuario(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM acordos
  WHERE criado_em >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
    AND (p_user_id IS NULL OR user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.listar_funcionarios()
RETURNS TABLE(user_id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT a.user_id, 
    COALESCE(u.raw_user_meta_data->>'nome', u.email) as nome
  FROM acordos a
  JOIN auth.users u ON u.id = a.user_id
  ORDER BY nome;
$$;
