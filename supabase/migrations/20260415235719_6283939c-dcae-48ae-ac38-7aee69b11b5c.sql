
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
