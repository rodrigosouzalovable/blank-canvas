
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  abas_permitidas text[] NOT NULL DEFAULT ARRAY['/conta', '/dashboard', '/acordos', '/acordos/novo', '/retornos', '/comissoes'],
  empresa text NOT NULL DEFAULT 'ume_novo_mundo',
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar permissões" ON public.user_permissions
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuários podem ver suas próprias permissões" ON public.user_permissions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Deny anonymous access to user_permissions" ON public.user_permissions
FOR ALL USING (false) WITH CHECK (false);

CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
