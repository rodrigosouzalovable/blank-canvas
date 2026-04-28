-- Adicionar coluna empresa na tabela acordos
ALTER TABLE public.acordos 
ADD COLUMN empresa TEXT NOT NULL DEFAULT 'ume_novo_mundo';