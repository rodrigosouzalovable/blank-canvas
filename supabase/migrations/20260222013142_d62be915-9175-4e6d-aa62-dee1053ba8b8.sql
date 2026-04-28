
-- Tabela de configuração de relatórios por credor
CREATE TABLE public.credor_relatorio_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credor_slug text UNIQUE NOT NULL,
  telefone text NOT NULL,
  frequencia text NOT NULL DEFAULT 'ambos',
  ativo boolean NOT NULL DEFAULT true,
  ultimo_envio_semanal timestamptz,
  ultimo_envio_mensal timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Trigger de validação para frequencia
CREATE OR REPLACE FUNCTION public.validate_credor_relatorio_frequencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.frequencia NOT IN ('semanal', 'mensal', 'ambos') THEN
    RAISE EXCEPTION 'frequencia deve ser semanal, mensal ou ambos';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_frequencia
  BEFORE INSERT OR UPDATE ON public.credor_relatorio_config
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_credor_relatorio_frequencia();

-- RLS
ALTER TABLE public.credor_relatorio_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar credor_relatorio_config"
  ON public.credor_relatorio_config
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to credor_relatorio_config"
  ON public.credor_relatorio_config
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Dados iniciais
INSERT INTO public.credor_relatorio_config (credor_slug, telefone, frequencia)
VALUES
  ('novomundo', '5562982183144', 'ambos'),
  ('grupoaltum', '5562982183144', 'ambos');
