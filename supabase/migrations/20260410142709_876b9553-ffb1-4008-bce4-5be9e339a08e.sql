
-- Allow shared users to see each other's lembretes_lidos
CREATE POLICY "Acordos compartilhados podem ver lembretes lidos do admin"
ON public.lembretes_lidos FOR SELECT TO authenticated
USING (
  user_id = get_acordos_compartilhados_admin(auth.uid())
);
