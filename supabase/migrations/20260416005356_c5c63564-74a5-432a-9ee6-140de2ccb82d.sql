
CREATE TABLE public.importacao_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome_arquivo text NOT NULL,
  credor text NOT NULL DEFAULT '',
  layout text NOT NULL DEFAULT 'padrao',
  status text NOT NULL DEFAULT 'pendente',
  total_registros integer NOT NULL DEFAULT 0,
  registros_inseridos integer NOT NULL DEFAULT 0,
  erro_mensagem text,
  dados_json jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.importacao_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar importacao_jobs"
  ON public.importacao_jobs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own import jobs"
  ON public.importacao_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own import jobs"
  ON public.importacao_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Deny anonymous access to importacao_jobs"
  ON public.importacao_jobs FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER update_importacao_jobs_updated_at
  BEFORE UPDATE ON public.importacao_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
