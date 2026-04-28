-- Pool de contatos externos auto-save
CREATE TABLE public.aquecimento_contatos_autosave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_uso_em timestamptz,
  total_usos integer NOT NULL DEFAULT 0,
  respondeu_ultima boolean NOT NULL DEFAULT false,
  total_respostas integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autosave_ativo_ultimo_uso 
  ON public.aquecimento_contatos_autosave (ativo, ultimo_uso_em NULLS FIRST);

ALTER TABLE public.aquecimento_contatos_autosave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam contatos autosave"
ON public.aquecimento_contatos_autosave
FOR ALL
TO authenticated
USING (public.is_admin_user(auth.uid()))
WITH CHECK (public.is_admin_user(auth.uid()));

CREATE TRIGGER trg_autosave_updated_at
BEFORE UPDATE ON public.aquecimento_contatos_autosave
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log de envios
CREATE TABLE public.aquecimento_envios_autosave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  contato_id uuid NOT NULL REFERENCES public.aquecimento_contatos_autosave(id) ON DELETE CASCADE,
  mensagem_enviada text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  respondeu boolean NOT NULL DEFAULT false,
  resposta_em timestamptz
);

CREATE INDEX idx_autosave_envios_instancia_data 
  ON public.aquecimento_envios_autosave (instancia_id, enviado_em DESC);
CREATE INDEX idx_autosave_envios_contato_instancia 
  ON public.aquecimento_envios_autosave (contato_id, instancia_id, enviado_em DESC);

ALTER TABLE public.aquecimento_envios_autosave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem envios autosave"
ON public.aquecimento_envios_autosave
FOR SELECT
TO authenticated
USING (public.is_admin_user(auth.uid()));