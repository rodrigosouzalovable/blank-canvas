
-- Create importacoes table
CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  credor text NOT NULL,
  total_registros integer NOT NULL DEFAULT 0,
  importado_por uuid NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar importacoes"
ON public.importacoes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuarios autenticados podem ver importacoes"
ON public.importacoes FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add importacao_id to devedores with CASCADE delete
ALTER TABLE public.devedores
ADD COLUMN importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE;
