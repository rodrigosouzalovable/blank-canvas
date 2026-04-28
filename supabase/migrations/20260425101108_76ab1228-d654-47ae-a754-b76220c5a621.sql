CREATE TABLE IF NOT EXISTS public.relatorios_diarios_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  conteudo text,
  status text NOT NULL DEFAULT 'PENDENTE',
  instancia_utilizada_id uuid,
  instancia_utilizada_nome text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.relatorios_diarios_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem relatorios diarios"
  ON public.relatorios_diarios_enviados
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins gerenciam relatorios diarios"
  ON public.relatorios_diarios_enviados
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_relatorios_diarios_atualizado_em
  BEFORE UPDATE ON public.relatorios_diarios_enviados
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();