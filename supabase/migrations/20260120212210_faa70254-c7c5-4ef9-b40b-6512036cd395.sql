-- Adicionar coluna para marcar duplicados como verificados
ALTER TABLE acordos 
ADD COLUMN duplicado_verificado boolean NOT NULL DEFAULT false;