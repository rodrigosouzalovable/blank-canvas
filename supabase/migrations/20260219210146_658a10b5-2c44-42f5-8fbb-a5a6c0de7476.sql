CREATE OR REPLACE FUNCTION ranking_mensal(p_mes_ano TEXT DEFAULT NULL)
RETURNS TABLE(user_id UUID, nome TEXT, total_recebido NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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