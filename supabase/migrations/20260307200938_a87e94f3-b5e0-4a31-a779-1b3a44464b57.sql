
-- Create storage bucket for training videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cobmais-videos', 'cobmais-videos', false);

-- RLS: Only admins can upload/manage videos
CREATE POLICY "Admins can upload videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cobmais-videos' AND
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can read videos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cobmais-videos' AND
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cobmais-videos' AND
  public.has_role(auth.uid(), 'admin')
);
