
CREATE TABLE public.whatsapp_conversas_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_origem_id UUID REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  instancia_destino_id UUID REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_msg_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_trocas INTEGER NOT NULL DEFAULT 0,
  max_trocas INTEGER NOT NULL DEFAULT 5,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
  historico JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.whatsapp_conversas_ia ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_conversas_ia_par ON public.whatsapp_conversas_ia (instancia_origem_id, instancia_destino_id, status);
CREATE INDEX idx_conversas_ia_status ON public.whatsapp_conversas_ia (status, ultima_msg_em);
