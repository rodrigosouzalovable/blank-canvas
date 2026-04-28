
-- Create notifications table for warming events
CREATE TABLE public.aquecimento_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL, -- 'novo_numero', 'mudanca_fase', 'aquecido', 'risco_bloqueio', 'meta_atingida'
  instancia_id UUID REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.aquecimento_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver notificacoes aquecimento"
  ON public.aquecimento_notificacoes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar notificacoes aquecimento"
  ON public.aquecimento_notificacoes FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar notificacoes aquecimento"
  ON public.aquecimento_notificacoes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role inserts (from edge function)
CREATE POLICY "Service pode inserir notificacoes"
  ON public.aquecimento_notificacoes FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add fase_auto column to instancias
ALTER TABLE public.whatsapp_aquecimento_instancias
  ADD COLUMN IF NOT EXISTS fase_auto BOOLEAN NOT NULL DEFAULT true;
