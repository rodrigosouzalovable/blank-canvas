
-- Add UPDATE policy on acordos for shared users
CREATE POLICY "Acordos compartilhados podem atualizar acordos do admin"
ON public.acordos
FOR UPDATE
TO authenticated
USING (user_id = get_acordos_compartilhados_admin(auth.uid()));

-- Add DELETE policy on acordos for shared users
CREATE POLICY "Acordos compartilhados podem deletar acordos do admin"
ON public.acordos
FOR DELETE
TO authenticated
USING (user_id = get_acordos_compartilhados_admin(auth.uid()));

-- Add UPDATE policy on pagamentos for shared users
CREATE POLICY "Acordos compartilhados podem atualizar pagamentos do admin"
ON public.pagamentos
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM acordos
  WHERE acordos.id = pagamentos.acordo_id
  AND acordos.user_id = get_acordos_compartilhados_admin(auth.uid())
));

-- Add INSERT policy on pagamentos for shared users
CREATE POLICY "Acordos compartilhados podem criar pagamentos do admin"
ON public.pagamentos
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM acordos
  WHERE acordos.id = pagamentos.acordo_id
  AND acordos.user_id = get_acordos_compartilhados_admin(auth.uid())
));

-- Add DELETE policy on pagamentos for shared users
CREATE POLICY "Acordos compartilhados podem deletar pagamentos do admin"
ON public.pagamentos
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM acordos
  WHERE acordos.id = pagamentos.acordo_id
  AND acordos.user_id = get_acordos_compartilhados_admin(auth.uid())
));
