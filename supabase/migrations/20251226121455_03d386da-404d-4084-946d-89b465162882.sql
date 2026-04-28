-- Adicionar coluna boleto_enviado na tabela acordos
ALTER TABLE public.acordos 
ADD COLUMN boleto_enviado boolean NOT NULL DEFAULT false;