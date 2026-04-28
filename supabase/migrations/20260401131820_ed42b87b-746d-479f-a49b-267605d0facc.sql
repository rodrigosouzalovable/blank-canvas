
-- Add media columns to whatsapp_mensagens
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS tipo_conteudo text NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS media_url text DEFAULT NULL;

-- Create public bucket for inbox media
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-media', 'inbox-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read inbox-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'inbox-media');

-- Authenticated users can upload
CREATE POLICY "Authenticated upload inbox-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inbox-media');

-- Authenticated users can delete their uploads
CREATE POLICY "Authenticated delete inbox-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inbox-media');
