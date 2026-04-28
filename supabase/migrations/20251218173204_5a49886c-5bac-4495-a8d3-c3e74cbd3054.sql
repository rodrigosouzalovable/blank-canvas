-- Criar política RLS para permitir usuários deletarem pagamentos de seus próprios acordos
CREATE POLICY "Usuários podem deletar pagamentos de seus acordos"
ON public.pagamentos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM acordos
    WHERE acordos.id = pagamentos.acordo_id
    AND acordos.user_id = auth.uid()
  )
);