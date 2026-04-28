-- Allow authenticated users to upload files to campaign-audio bucket
CREATE POLICY "Authenticated users can upload to campaign-audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'campaign-audio');

-- Allow authenticated users to update their files
CREATE POLICY "Authenticated users can update campaign-audio"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'campaign-audio');

-- Allow public read access (bucket is already public)
CREATE POLICY "Public read access to campaign-audio"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'campaign-audio');