CREATE POLICY "Admins podem criar acordos para qualquer usuário"
ON public.acordos
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));