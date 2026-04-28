-- Permitir que admins atualizem qualquer acordo
CREATE POLICY "Admins podem atualizar todos os acordos" 
ON public.acordos 
FOR UPDATE 
TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));