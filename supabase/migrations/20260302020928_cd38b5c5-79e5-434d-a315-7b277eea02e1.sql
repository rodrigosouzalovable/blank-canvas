
CREATE POLICY "Usuarios autenticados podem deletar acordos_devedor"
ON public.acordos_devedor
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);
