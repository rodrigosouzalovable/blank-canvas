SELECT cron.unschedule('aquecimento-auto-diario');

SELECT cron.schedule(
  'aquecimento-auto-diario',
  '*/30 10-23,0 * * *',
  $$
  SELECT net.http_post(
    url:='https://cymdrkeukockakfzjeen.supabase.co/functions/v1/whatsapp-aquecimento',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5bWRya2V1a29ja2FrZnpqZWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjI0OTQsImV4cCI6MjA4MTYzODQ5NH0.mjcAvZDXLA6m46JCR474jZDHOF2WmWUXygChA4z__2U"}'::jsonb,
    body:=concat('{"trigger":"cron","time":"', now(), '"}')::jsonb
  ) as request_id;
  $$
);