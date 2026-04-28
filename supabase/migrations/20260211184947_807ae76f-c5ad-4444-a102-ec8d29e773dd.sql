
-- Drop existing check constraint and recreate with 'quebrado' status
ALTER TABLE public.acordos DROP CONSTRAINT IF EXISTS acordos_status_check;
ALTER TABLE public.acordos ADD CONSTRAINT acordos_status_check CHECK (status IN ('ativo', 'concluido', 'cancelado', 'quebrado'));
