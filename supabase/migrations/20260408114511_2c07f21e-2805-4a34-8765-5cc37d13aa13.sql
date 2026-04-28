ALTER TABLE lembrete_mensagens_templates 
  ADD COLUMN botoes_texto TEXT DEFAULT NULL,
  ADD COLUMN botoes_choices JSONB DEFAULT NULL;