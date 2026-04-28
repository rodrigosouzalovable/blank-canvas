ALTER TABLE public.user_whatsapp_instances
  ADD COLUMN IF NOT EXISTS whatsapp_profile_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_photo_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_description text,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_address text,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_email text;