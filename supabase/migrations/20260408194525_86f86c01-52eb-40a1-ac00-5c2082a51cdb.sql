
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
