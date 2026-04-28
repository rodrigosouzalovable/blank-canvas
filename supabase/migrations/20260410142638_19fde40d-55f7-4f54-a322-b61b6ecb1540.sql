
-- Policy for pagamentos: employees with shared access can see admin's payments
CREATE POLICY "Acordos compartilhados podem ver pagamentos do admin"
ON public.pagamentos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM acordos
    WHERE acordos.id = pagamentos.acordo_id
      AND acordos.user_id = get_acordos_compartilhados_admin(auth.uid())
  )
);

-- Policy for retornos: employees with shared access can see admin's returns
CREATE POLICY "Acordos compartilhados podem ver retornos do admin"
ON public.retornos FOR SELECT TO authenticated
USING (
  user_id = get_acordos_compartilhados_admin(auth.uid())
);
