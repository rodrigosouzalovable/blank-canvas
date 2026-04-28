
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS whatsapp_lembrete_server_url text,
ADD COLUMN IF NOT EXISTS whatsapp_lembrete_instance_token text;

ALTER TABLE public.whatsapp_fila
ADD COLUMN IF NOT EXISTS server_url text,
ADD COLUMN IF NOT EXISTS instance_token text;
