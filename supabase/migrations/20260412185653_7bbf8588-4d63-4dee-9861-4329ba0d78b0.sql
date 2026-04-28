-- Remove cron job duplicado de process-whatsapp-queue (roda a cada MINUTO - desperdiçando $$$)
-- Job 10 já faz isso a cada 10 min, não precisa do Job 2
SELECT cron.unschedule(2);

-- Remove cron job duplicado de whatsapp-aquecimento (Job 12 a cada 30min, Job 16 a cada 15min)
-- Manter apenas o Job 16 (*/15) que é mais recente
SELECT cron.unschedule(12);

-- Reduzir process-acionamento-agendado de CADA MINUTO para cada 5 minutos
SELECT cron.unschedule(14);
SELECT cron.schedule(
  'process-acionamento-agendado-v2',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://cymdrkeukockakfzjeen.supabase.co/functions/v1/process-acionamento-agendado',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5bWRya2V1a29ja2FrZnpqZWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjI0OTQsImV4cCI6MjA4MTYzODQ5NH0.mjcAvZDXLA6m46JCR474jZDHOF2WmWUXygChA4z__2U"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);

-- Também remover Job 1 duplicado de check-payment-reminders (Job 1 e Job 8 fazem a mesma coisa)
SELECT cron.unschedule(1);