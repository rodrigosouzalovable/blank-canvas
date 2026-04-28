
-- Add acordos_compartilhados column
ALTER TABLE public.user_permissions
ADD COLUMN acordos_compartilhados boolean NOT NULL DEFAULT false;

-- Security definer function to get concedido_por for a user with acordos_compartilhados
CREATE OR REPLACE FUNCTION public.get_acordos_compartilhados_admin(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT concedido_por
  FROM public.user_permissions
  WHERE user_id = _user_id
    AND acordos_compartilhados = true
    AND concedido_por IS NOT NULL
  LIMIT 1;
$$;

-- RLS policy: users with acordos_compartilhados can SELECT acordos from their admin
CREATE POLICY "Acordos compartilhados podem ver acordos do admin"
ON public.acordos
FOR SELECT
TO authenticated
USING (
  user_id = public.get_acordos_compartilhados_admin(auth.uid())
);
