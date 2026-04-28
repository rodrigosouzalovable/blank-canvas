-- Dropar políticas antigas de SELECT que estão como RESTRICTIVE
DROP POLICY IF EXISTS "Usuários podem ver pagamentos de seus acordos" ON public.pagamentos;
DROP POLICY IF EXISTS "Gestores podem ver pagamentos da equipe" ON public.pagamentos;

-- Recriar como PERMISSIVE (padrão) para funcionários
CREATE POLICY "Usuários podem ver pagamentos de seus acordos"
  ON public.pagamentos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM acordos
      WHERE acordos.id = pagamentos.acordo_id
      AND acordos.user_id = auth.uid()
    )
  );

-- Recriar como PERMISSIVE para gestores
CREATE POLICY "Gestores podem ver pagamentos da equipe"
  ON public.pagamentos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM acordos
      JOIN team_members ON team_members.funcionario_id = acordos.user_id
      WHERE acordos.id = pagamentos.acordo_id
      AND team_members.gestor_id = auth.uid()
    )
  );

-- Adicionar política para Admins verem todos os pagamentos
CREATE POLICY "Admins podem ver todos os pagamentos"
  ON public.pagamentos
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));