-- Add CPF and phone columns to acordos table
ALTER TABLE public.acordos
ADD COLUMN cliente_cpf text,
ADD COLUMN cliente_telefone text;