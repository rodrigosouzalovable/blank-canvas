CREATE POLICY "Usuarios autenticados podem atualizar estagio devedores"
ON public.devedores
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);