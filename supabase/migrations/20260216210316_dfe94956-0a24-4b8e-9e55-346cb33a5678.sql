
-- Tabela de eventos do devedor
CREATE TABLE public.devedor_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  devedor_id UUID NOT NULL REFERENCES public.devedores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  arquivo_url TEXT,
  arquivo_nome TEXT,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.devedor_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar eventos" ON public.devedor_eventos
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuarios autenticados podem ver eventos" ON public.devedor_eventos
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados podem criar eventos" ON public.devedor_eventos
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = criado_por);

CREATE POLICY "Deny anonymous access to devedor_eventos" ON public.devedor_eventos
FOR ALL USING (false) WITH CHECK (false);

-- Bucket privado para arquivos
INSERT INTO storage.buckets (id, name, public) VALUES ('devedor-arquivos', 'devedor-arquivos', false);

CREATE POLICY "Usuarios autenticados podem fazer upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'devedor-arquivos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Usuarios autenticados podem ver arquivos" ON storage.objects
FOR SELECT USING (bucket_id = 'devedor-arquivos' AND auth.uid() IS NOT NULL);
