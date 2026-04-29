
-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "Usuarios veem proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios veem proprio perfil" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Usuarios atualizam proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios atualizam proprio perfil" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admins podem ver todos os perfis" ON public.profiles;
CREATE POLICY "Admins podem ver todos os perfis" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins podem gerenciar perfis" ON public.profiles;
CREATE POLICY "Admins podem gerenciar perfis" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Gestores podem ver perfis da equipe" ON public.profiles;
CREATE POLICY "Gestores podem ver perfis da equipe" ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.gestor_id = auth.uid() AND team_members.funcionario_id = profiles.id
  ));

DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;
CREATE POLICY "Deny anonymous access to profiles" ON public.profiles
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- team_members
DROP POLICY IF EXISTS "Admins podem gerenciar equipes" ON public.team_members;
CREATE POLICY "Admins podem gerenciar equipes" ON public.team_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Gestores podem ver sua equipe" ON public.team_members;
CREATE POLICY "Gestores podem ver sua equipe" ON public.team_members
  FOR SELECT TO authenticated USING (gestor_id = auth.uid());

DROP POLICY IF EXISTS "Deny anonymous access to team_members" ON public.team_members;
CREATE POLICY "Deny anonymous access to team_members" ON public.team_members
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- user_permissions
DROP POLICY IF EXISTS "Admins podem gerenciar permissoes" ON public.user_permissions;
CREATE POLICY "Admins podem gerenciar permissoes" ON public.user_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Usuarios veem proprias permissoes" ON public.user_permissions;
CREATE POLICY "Usuarios veem proprias permissoes" ON public.user_permissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Deny anonymous access to user_permissions" ON public.user_permissions;
CREATE POLICY "Deny anonymous access to user_permissions" ON public.user_permissions
  FOR ALL TO anon USING (false) WITH CHECK (false);
