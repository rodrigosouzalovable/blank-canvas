CREATE TABLE public.whatsapp_contatos_agenda_salvos (
  instancia_id uuid NOT NULL,
  numero_destino text NOT NULL,
  nome_salvo text,
  salvo_em timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (instancia_id, numero_destino)
);

CREATE INDEX idx_wa_agenda_salvos_instancia ON public.whatsapp_contatos_agenda_salvos(instancia_id);

ALTER TABLE public.whatsapp_contatos_agenda_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem agenda salvos"
  ON public.whatsapp_contatos_agenda_salvos
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access"
  ON public.whatsapp_contatos_agenda_salvos
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);