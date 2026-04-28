-- Create table for manager-employee associations
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gestor_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (gestor_id, funcionario_id)
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with team_members
CREATE POLICY "Admins podem gerenciar equipes"
ON public.team_members
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Managers can view their own team
CREATE POLICY "Gestores podem ver sua equipe"
ON public.team_members
FOR SELECT
USING (gestor_id = auth.uid());

-- Allow admins to view all profiles
CREATE POLICY "Admins podem ver todos os perfis"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to manage user_roles
CREATE POLICY "Admins podem gerenciar papéis"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Managers can view profiles of their team members
CREATE POLICY "Gestores podem ver perfis da equipe"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.gestor_id = auth.uid()
    AND team_members.funcionario_id = profiles.id
  )
);

-- Managers can view agreements of their team members
CREATE POLICY "Gestores podem ver acordos da equipe"
ON public.acordos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.gestor_id = auth.uid()
    AND team_members.funcionario_id = acordos.user_id
  )
);

-- Managers can view payments of their team members' agreements
CREATE POLICY "Gestores podem ver pagamentos da equipe"
ON public.pagamentos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.acordos
    JOIN public.team_members ON team_members.funcionario_id = acordos.user_id
    WHERE acordos.id = pagamentos.acordo_id
    AND team_members.gestor_id = auth.uid()
  )
);