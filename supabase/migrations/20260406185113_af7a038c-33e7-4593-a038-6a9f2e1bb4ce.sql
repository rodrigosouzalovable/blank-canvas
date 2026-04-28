
CREATE TABLE public.relatorio_diario_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id UUID REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE NOT NULL,
  telefone_destino TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one config row should exist
CREATE UNIQUE INDEX idx_relatorio_diario_config_unique ON public.relatorio_diario_config ((true));

ALTER TABLE public.relatorio_diario_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage relatorio config"
ON public.relatorio_diario_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
