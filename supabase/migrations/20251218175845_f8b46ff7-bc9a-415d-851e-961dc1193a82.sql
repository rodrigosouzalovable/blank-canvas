-- Remover política incorreta que bloqueia todos os usuários
DROP POLICY IF EXISTS "Deny anonymous access to lembretes_lidos" ON public.lembretes_lidos;

-- Criar política correta que permite apenas usuários autenticados
CREATE POLICY "Deny anonymous access to lembretes_lidos"
ON public.lembretes_lidos
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);