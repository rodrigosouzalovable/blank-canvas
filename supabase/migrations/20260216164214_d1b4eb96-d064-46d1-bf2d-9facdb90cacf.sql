
-- Add credor and estagio columns to devedores
ALTER TABLE public.devedores ADD COLUMN credor text;
ALTER TABLE public.devedores ADD COLUMN estagio text NOT NULL DEFAULT 'novo';

-- Copy existing descricao to credor for existing records
UPDATE public.devedores SET credor = descricao WHERE descricao IS NOT NULL;

-- Add SELECT policy for authenticated users
CREATE POLICY "Usuarios autenticados podem ver devedores"
ON public.devedores
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Update default abas_permitidas to include /clientes
ALTER TABLE public.user_permissions 
ALTER COLUMN abas_permitidas SET DEFAULT ARRAY['/conta', '/dashboard', '/acordos', '/acordos/novo', '/retornos', '/clientes', '/comissoes'];
