-- Permitir que administradores excluam qualquer acordo
CREATE POLICY "Admins podem deletar todos os acordos"
ON public.acordos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));