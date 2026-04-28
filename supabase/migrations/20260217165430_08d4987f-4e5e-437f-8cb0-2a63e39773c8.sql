
CREATE TABLE public.grupo_empresarial_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_grupo text NOT NULL,
  cpf_cnpj text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL
);

ALTER TABLE public.grupo_empresarial_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar grupos empresariais"
ON public.grupo_empresarial_membros
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuarios autenticados podem ver grupos"
ON public.grupo_empresarial_membros
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_grupo_membros_cpf ON public.grupo_empresarial_membros(cpf_cnpj);
CREATE INDEX idx_grupo_membros_grupo ON public.grupo_empresarial_membros(grupo_id);
