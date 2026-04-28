CREATE TABLE public.whatsapp_conversas_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_origem_id uuid,
  instancia_destino_id uuid,
  numero_origem text,
  numero_destino text,
  etapa text NOT NULL,
  status text NOT NULL,
  mensagem_original text,
  resposta_gerada text,
  motivo text,
  http_status integer,
  tempo_resposta_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aud_created ON public.whatsapp_conversas_auditoria (created_at DESC);
CREATE INDEX idx_aud_par ON public.whatsapp_conversas_auditoria
  (instancia_origem_id, instancia_destino_id, created_at DESC);

ALTER TABLE public.whatsapp_conversas_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_auditoria"
  ON public.whatsapp_conversas_auditoria
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));