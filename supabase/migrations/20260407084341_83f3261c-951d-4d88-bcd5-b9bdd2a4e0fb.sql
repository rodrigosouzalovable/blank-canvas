
-- Add tipo_interacao column to existing interactions table
ALTER TABLE public.whatsapp_aquecimento_interacoes
ADD COLUMN IF NOT EXISTS tipo_interacao text NOT NULL DEFAULT 'mensagem';

-- Partial index for querying status posts by day
CREATE INDEX IF NOT EXISTS idx_aquecimento_interacoes_status_dia
ON public.whatsapp_aquecimento_interacoes (instancia_origem_id, tipo_interacao, created_at)
WHERE tipo_interacao = 'status';

-- Status log table to track content and avoid repetition
CREATE TABLE IF NOT EXISTS public.whatsapp_aquecimento_status_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'text',
  conteudo text,
  conteudo_url text,
  postado_em timestamp with time zone NOT NULL DEFAULT now(),
  resultado text NOT NULL DEFAULT 'ENVIADO'
);

ALTER TABLE public.whatsapp_aquecimento_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar status_log"
ON public.whatsapp_aquecimento_status_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for checking if already posted today
CREATE INDEX IF NOT EXISTS idx_status_log_instancia_dia
ON public.whatsapp_aquecimento_status_log (instancia_id, postado_em);
