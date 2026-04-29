-- 1) Adicionar 'gestor' ao enum app_role (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'gestor'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'gestor';
  END IF;
END$$;

-- 2) cpf_normalize
CREATE OR REPLACE FUNCTION public.cpf_normalize(cpf_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN regexp_replace(COALESCE(cpf_input, ''), '[^0-9]', '', 'g');
END;
$$;

-- 3) cpf_has_acordo
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
GRANT EXECUTE ON FUNCTION public.cpf_has_acordo(text) TO authenticated;

-- 4) cpf_ultimo_acordo_quebrado
CREATE OR REPLACE FUNCTION public.cpf_ultimo_acordo_quebrado(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ultimo_acordo record;
BEGIN
  IF p_cpf IS NULL OR cpf_normalize(p_cpf) = '' THEN
    RETURN false;
  END IF;

  SELECT id, status INTO v_ultimo_acordo
  FROM acordos
  WHERE cpf_normalize(cliente_cpf) = cpf_normalize(p_cpf)
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_ultimo_acordo IS NULL THEN
    RETURN false;
  END IF;

  IF v_ultimo_acordo.status = 'quebrado' THEN
    RETURN true;
  END IF;

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
$$;

-- 5) cpf_acordo_funcionario_nome
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

-- 6) consultar_debitos_por_cpf
DROP FUNCTION IF EXISTS public.consultar_debitos_por_cpf(text);
CREATE OR REPLACE FUNCTION public.consultar_debitos_por_cpf(p_cpf TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  cpf TEXT,
  valor_original NUMERIC,
  valor_atualizado NUMERIC,
  descricao TEXT,
  contrato TEXT,
  data_vencimento DATE,
  credor TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.nome, d.cpf, d.valor_original, d.valor_atualizado,
         d.descricao, d.contrato, d.data_vencimento, d.credor
  FROM public.devedores d
  WHERE cpf_normalize(d.cpf) = cpf_normalize(p_cpf)
    AND d.ativo = true;
$$;

-- 7) consultar_acordo_ativo_por_cpf
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
  SELECT a.status, a.criado_em, p.nome
  FROM acordos a
  JOIN profiles p ON p.id = a.user_id
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(p_cpf)
    AND a.status IN ('ativo', 'concluido')
  ORDER BY a.criado_em DESC
  LIMIT 1;
END;
$$;

-- 8) consultar_parcelas_acordo_por_cpf
CREATE OR REPLACE FUNCTION public.consultar_parcelas_acordo_por_cpf(p_cpf text)
RETURNS TABLE(
  numero_parcela integer,
  valor_parcela numeric,
  data_prevista date,
  status text,
  data_paga date,
  total_parcelas integer,
  valor_total_acordo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acordo_id uuid;
  v_total_parcelas integer;
  v_valor_total numeric;
BEGIN
  SELECT a.id, a.parcelas, a.valor_total
  INTO v_acordo_id, v_total_parcelas, v_valor_total
  FROM acordos a
  WHERE cpf_normalize(a.cliente_cpf) = cpf_normalize(p_cpf)
    AND a.status IN ('ativo', 'concluido')
  ORDER BY a.criado_em DESC
  LIMIT 1;

  IF v_acordo_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.numero_parcela, p.valor_parcela, p.data_prevista, p.status,
         p.data_paga, v_total_parcelas, v_valor_total
  FROM pagamentos p
  WHERE p.acordo_id = v_acordo_id
  ORDER BY p.numero_parcela;
END;
$$;

-- 9) listar_credores_distintos
CREATE OR REPLACE FUNCTION public.listar_credores_distintos()
RETURNS TABLE(credor text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT d.credor
  FROM public.devedores d
  WHERE d.ativo = true
    AND d.credor IS NOT NULL
    AND d.credor <> ''
  ORDER BY d.credor;
$$;
GRANT EXECUTE ON FUNCTION public.listar_credores_distintos() TO authenticated;

-- 10) buscar_devedores_por_documento
CREATE OR REPLACE FUNCTION public.buscar_devedores_por_documento(
  p_doc text,
  p_credor text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, nome text, cpf text, credor text, contrato text,
  valor_original numeric, valor_atualizado numeric, estagio text,
  telefone text, data_vencimento date, descricao text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text;
BEGIN
  v_doc := regexp_replace(COALESCE(p_doc, ''), '[^0-9]', '', 'g');
  IF v_doc = '' THEN RETURN; END IF;

  IF length(v_doc) >= 11 THEN
    RETURN QUERY
    SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
           d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
           d.data_vencimento, d.descricao
    FROM public.devedores d
    WHERE d.ativo = true
      AND public.cpf_normalize(d.cpf) = v_doc
      AND (p_credor IS NULL OR p_credor = '' OR d.credor = p_credor)
    ORDER BY d.nome
    LIMIT 5000;
  ELSE
    RETURN QUERY
    SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
           d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
           d.data_vencimento, d.descricao
    FROM public.devedores d
    WHERE d.ativo = true
      AND public.cpf_normalize(d.cpf) LIKE v_doc || '%'
      AND (p_credor IS NULL OR p_credor = '' OR d.credor = p_credor)
    ORDER BY d.nome
    LIMIT 5000;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.buscar_devedores_por_documento(text, text) TO authenticated;

-- 11) listar_devedores_por_credor
CREATE OR REPLACE FUNCTION public.listar_devedores_por_credor(p_credor text)
RETURNS TABLE(
  id uuid, nome text, cpf text, credor text, contrato text,
  valor_original numeric, valor_atualizado numeric, estagio text,
  telefone text, data_vencimento date, descricao text, tem_acordo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cpfs_com_acordo AS (
    SELECT DISTINCT public.cpf_normalize(a.cliente_cpf) AS cpf_n
    FROM public.acordos a
    WHERE a.status = 'ativo'
  )
  SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
         d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
         d.data_vencimento, d.descricao,
         (c.cpf_n IS NOT NULL) AS tem_acordo
  FROM public.devedores d
  LEFT JOIN cpfs_com_acordo c ON c.cpf_n = public.cpf_normalize(d.cpf)
  WHERE d.ativo = true
    AND d.credor = p_credor
  ORDER BY (c.cpf_n IS NOT NULL) DESC, d.nome ASC
  LIMIT 5000;
$$;
GRANT EXECUTE ON FUNCTION public.listar_devedores_por_credor(text) TO authenticated;

-- 12) listar_funcionarios
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

-- 13) contar_acordos_hoje_por_usuario
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

-- 14) delete_acordo_atomico
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

-- 15) delete_importacao_em_lotes
CREATE OR REPLACE FUNCTION public.delete_importacao_em_lotes(p_importacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $$
DECLARE
  v_deleted integer := 0;
  v_batch integer;
BEGIN
  LOOP
    DELETE FROM devedores
    WHERE id IN (
      SELECT id FROM devedores
      WHERE importacao_id = p_importacao_id
      LIMIT 200
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  DELETE FROM importacoes WHERE id = p_importacao_id;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

-- 16) ranking_mensal
CREATE OR REPLACE FUNCTION public.ranking_mensal(p_mes_ano TEXT DEFAULT NULL)
RETURNS TABLE(user_id UUID, nome TEXT, total_recebido NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mes_ano TEXT;
BEGIN
  v_mes_ano := COALESCE(p_mes_ano, to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'));
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.nome,
    COALESCE(SUM(pg.valor_parcela), 0) AS total_recebido
  FROM profiles p
  LEFT JOIN acordos a ON a.user_id = p.id
  LEFT JOIN pagamentos pg ON pg.acordo_id = a.id
    AND pg.status = 'pago'
    AND pg.data_paga >= (v_mes_ano || '-01')::DATE
    AND pg.data_paga < ((v_mes_ano || '-01')::DATE + INTERVAL '1 month')
  GROUP BY p.id, p.nome
  ORDER BY total_recebido DESC;
END;
$$;

-- 17) comparativo_mensal_global
CREATE OR REPLACE FUNCTION public.comparativo_mensal_global(
  p_inicio_atual timestamptz,
  p_fim_atual timestamptz,
  p_inicio_anterior timestamptz,
  p_fim_anterior timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN jsonb_build_object(
    'acordos_atual_qtd', (SELECT count(*) FROM acordos WHERE criado_em >= p_inicio_atual AND criado_em <= p_fim_atual),
    'acordos_atual_valor', (SELECT coalesce(sum(valor_total),0) FROM acordos WHERE criado_em >= p_inicio_atual AND criado_em <= p_fim_atual),
    'acordos_anterior_qtd', (SELECT count(*) FROM acordos WHERE criado_em >= p_inicio_anterior AND criado_em <= p_fim_anterior),
    'acordos_anterior_valor', (SELECT coalesce(sum(valor_total),0) FROM acordos WHERE criado_em >= p_inicio_anterior AND criado_em <= p_fim_anterior),
    'pgtos_atual_qtd', (SELECT count(*) FROM pagamentos WHERE status='pago' AND data_paga >= p_inicio_atual::date AND data_paga <= p_fim_atual::date),
    'pgtos_atual_valor', (SELECT coalesce(sum(valor_parcela),0) FROM pagamentos WHERE status='pago' AND data_paga >= p_inicio_atual::date AND data_paga <= p_fim_atual::date),
    'pgtos_anterior_qtd', (SELECT count(*) FROM pagamentos WHERE status='pago' AND data_paga >= p_inicio_anterior::date AND data_paga <= p_fim_anterior::date),
    'pgtos_anterior_valor', (SELECT coalesce(sum(valor_parcela),0) FROM pagamentos WHERE status='pago' AND data_paga >= p_inicio_anterior::date AND data_paga <= p_fim_anterior::date)
  );
END;
$$;