
-- Function to sync instances to aquecimento
CREATE OR REPLACE FUNCTION public.sync_instance_to_aquecimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT with ativo=true, or UPDATE setting ativo=true
  IF NEW.ativo = true THEN
    INSERT INTO whatsapp_aquecimento_instancias (
      instancia_id, status, fase, fase_auto, limite_diario,
      dias_na_fase, interacoes_hoje, interacoes_total, respostas_recebidas
    ) VALUES (
      NEW.id, 'EM_AQUECIMENTO', 1, true, 15,
      0, 0, 0, 0
    )
    ON CONFLICT (instancia_id) DO UPDATE SET
      status = CASE 
        WHEN whatsapp_aquecimento_instancias.status IN ('PAUSADO', 'REMOVIDO') 
        THEN 'EM_AQUECIMENTO'
        ELSE whatsapp_aquecimento_instancias.status
      END,
      updated_at = now();
  ELSIF NEW.ativo = false THEN
    -- Deactivated: pause in aquecimento
    UPDATE whatsapp_aquecimento_instancias
    SET status = 'PAUSADO', updated_at = now()
    WHERE instancia_id = NEW.id
      AND status NOT IN ('PAUSADO', 'REMOVIDO');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT and UPDATE on ativo column
CREATE TRIGGER sync_aquecimento_on_instance_change
  AFTER INSERT OR UPDATE OF ativo ON public.user_whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_instance_to_aquecimento();

-- Immediately enroll all active instances that are missing from aquecimento
INSERT INTO whatsapp_aquecimento_instancias (
  instancia_id, status, fase, fase_auto, limite_diario,
  dias_na_fase, interacoes_hoje, interacoes_total, respostas_recebidas
)
SELECT 
  i.id, 'EM_AQUECIMENTO', 1, true, 15,
  0, 0, 0, 0
FROM user_whatsapp_instances i
WHERE i.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_aquecimento_instancias a
    WHERE a.instancia_id = i.id
  );

-- Reactivate any that were PAUSADO/REMOVIDO but instance is now active
UPDATE whatsapp_aquecimento_instancias a
SET status = 'EM_AQUECIMENTO', updated_at = now()
FROM user_whatsapp_instances i
WHERE a.instancia_id = i.id
  AND i.ativo = true
  AND a.status IN ('PAUSADO', 'REMOVIDO');

-- Pause any that are active in aquecimento but instance is inactive
UPDATE whatsapp_aquecimento_instancias a
SET status = 'PAUSADO', updated_at = now()
FROM user_whatsapp_instances i
WHERE a.instancia_id = i.id
  AND i.ativo = false
  AND a.status NOT IN ('PAUSADO', 'REMOVIDO');
