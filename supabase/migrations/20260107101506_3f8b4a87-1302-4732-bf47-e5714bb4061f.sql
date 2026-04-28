-- Adicionar colunas de dados do acordo na tabela retornos
ALTER TABLE public.retornos
ADD COLUMN valor_total NUMERIC,
ADD COLUMN numero_parcelas INTEGER,
ADD COLUMN valor_primeira_parcela NUMERIC,
ADD COLUMN valor_demais_parcelas NUMERIC,
ADD COLUMN data_primeiro_pagamento DATE;