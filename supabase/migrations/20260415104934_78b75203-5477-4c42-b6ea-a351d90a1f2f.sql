UPDATE whatsapp_aquecimento_instancias
SET status = 'EM_AQUECIMENTO', updated_at = now()
WHERE status = 'PAUSADO'
AND instancia_id IN (
  SELECT id FROM user_whatsapp_instances WHERE ativo = true
);