-- Permitir registrar envios para números âncora (sem contato_id na pool)
ALTER TABLE public.aquecimento_envios_autosave
  ALTER COLUMN contato_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS numero_destino TEXT;

CREATE INDEX IF NOT EXISTS idx_envios_autosave_inst_destino_data
  ON public.aquecimento_envios_autosave (instancia_id, numero_destino, enviado_em DESC);