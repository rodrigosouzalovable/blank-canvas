
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create scheduling table
CREATE TABLE public.acionamento_agendamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  historico_data JSONB NOT NULL,
  agendado_para TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  min_sec INTEGER NOT NULL DEFAULT 300,
  max_sec INTEGER NOT NULL DEFAULT 500,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acionamento_agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedules"
  ON public.acionamento_agendamentos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own schedules"
  ON public.acionamento_agendamentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON public.acionamento_agendamentos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_acionamento_agendamentos_updated_at
  BEFORE UPDATE ON public.acionamento_agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
