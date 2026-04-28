-- Índice btree direto em devedores.cpf para suportar consultas .in('cpf', [...]) sem timeout.
-- O índice existente é em cpf_normalize(cpf) e só é usado quando a função é chamada.
CREATE INDEX IF NOT EXISTS idx_devedores_cpf_btree ON public.devedores (cpf);