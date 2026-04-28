
-- Tabela de etiquetas personalizadas
CREATE TABLE public.whatsapp_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#25D366',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own etiquetas"
  ON public.whatsapp_etiquetas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin') OR has_inbox_compartilhado(auth.uid()));

CREATE POLICY "Users can create own etiquetas"
  ON public.whatsapp_etiquetas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own etiquetas"
  ON public.whatsapp_etiquetas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own etiquetas"
  ON public.whatsapp_etiquetas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tabela de associação contato-etiqueta
CREATE TABLE public.whatsapp_contato_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id uuid NOT NULL REFERENCES public.whatsapp_contatos(id) ON DELETE CASCADE,
  etiqueta_id uuid NOT NULL REFERENCES public.whatsapp_etiquetas(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contato_id, etiqueta_id)
);

ALTER TABLE public.whatsapp_contato_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view contato_etiquetas"
  ON public.whatsapp_contato_etiquetas FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert contato_etiquetas"
  ON public.whatsapp_contato_etiquetas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete contato_etiquetas"
  ON public.whatsapp_contato_etiquetas FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contato_etiquetas;
