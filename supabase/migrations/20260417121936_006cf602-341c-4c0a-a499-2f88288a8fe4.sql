
CREATE TABLE IF NOT EXISTS public.whatsapp_aquecimento_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid text NOT NULL UNIQUE,
  nome text NOT NULL,
  instancia_admin_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  auto_add_novas boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_aquecimento_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam grupos aquecimento"
ON public.whatsapp_aquecimento_grupos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auth pode ler grupos aquecimento"
ON public.whatsapp_aquecimento_grupos
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER trg_grupos_aquecimento_updated
BEFORE UPDATE ON public.whatsapp_aquecimento_grupos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_aquecimento_grupo_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.whatsapp_aquecimento_grupos(id) ON DELETE CASCADE,
  instancia_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  invite_link text,
  erro_mensagem text,
  tentativas integer NOT NULL DEFAULT 0,
  ultima_tentativa_em timestamptz,
  adicionado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(grupo_id, instancia_id)
);

ALTER TABLE public.whatsapp_aquecimento_grupo_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam membros grupo aquecimento"
ON public.whatsapp_aquecimento_grupo_membros
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auth pode ler membros grupo aquecimento"
ON public.whatsapp_aquecimento_grupo_membros
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER trg_grupo_membros_updated
BEFORE UPDATE ON public.whatsapp_aquecimento_grupo_membros
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_grupo_membros_grupo ON public.whatsapp_aquecimento_grupo_membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_instancia ON public.whatsapp_aquecimento_grupo_membros(instancia_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_status ON public.whatsapp_aquecimento_grupo_membros(status);
