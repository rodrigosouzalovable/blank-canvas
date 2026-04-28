
-- Fix existing outgoing messages with mismatched phone numbers
UPDATE whatsapp_mensagens m
SET telefone_remoto = c.telefone
FROM whatsapp_contatos c
WHERE c.instancia_id = m.instancia_id
  AND RIGHT(c.telefone, 8) = RIGHT(m.telefone_remoto, 8)
  AND c.telefone != m.telefone_remoto
  AND m.direcao = 'saida';
