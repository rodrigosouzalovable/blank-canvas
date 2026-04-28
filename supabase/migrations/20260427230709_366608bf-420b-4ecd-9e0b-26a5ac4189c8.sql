SELECT cron.schedule(
  'purge-conversas-auditoria',
  '0 6 * * *',
  $$DELETE FROM public.whatsapp_conversas_auditoria WHERE created_at < now() - interval '7 days';$$
);