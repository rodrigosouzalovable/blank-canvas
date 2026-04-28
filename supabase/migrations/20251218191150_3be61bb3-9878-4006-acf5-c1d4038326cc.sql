-- Permitir que admins vejam todos os acordos
CREATE POLICY "Admins podem ver todos os acordos"
ON public.acordos
FOR SELECT
USING (has_role(auth.uid(), 'admin'));