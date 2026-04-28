CREATE OR REPLACE FUNCTION public.sync_instance_to_aquecimento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_idade_dias numeric;
BEGIN
  IF NEW.ativo = true THEN
    v_idade_dias := EXTRACT(EPOCH FROM (now() - NEW.criado_em)) / 86400.0;
    v_status := CASE WHEN v_idade_dias < 5 THEN 'AGUARDANDO_MATURACAO' ELSE 'EM_AQUECIMENTO' END;

    INSERT INTO whatsapp_aquecimento_instancias (
      instancia_id, status, fase, fase_auto, limite_diario,
      dias_na_fase, interacoes_hoje, interacoes_total, respostas_recebidas
    ) VALUES (
      NEW.id, v_status, 1, true, 15,
      0, 0, 0, 0
    )
    ON CONFLICT (instancia_id) DO UPDATE SET
      status = CASE 
        WHEN whatsapp_aquecimento_instancias.status IN ('PAUSADO', 'REMOVIDO') 
        THEN v_status
        ELSE whatsapp_aquecimento_instancias.status
      END,
      updated_at = now();
  ELSIF NEW.ativo = false THEN
    UPDATE whatsapp_aquecimento_instancias
    SET status = 'PAUSADO', updated_at = now()
    WHERE instancia_id = NEW.id
      AND status NOT IN ('PAUSADO', 'REMOVIDO');
  END IF;
  
  RETURN NEW;
END;
$function$;