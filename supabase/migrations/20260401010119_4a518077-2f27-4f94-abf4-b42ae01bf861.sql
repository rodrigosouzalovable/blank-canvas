
-- Create voice_campaign_audios table
CREATE TABLE public.voice_campaign_audios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.voice_campaigns(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_campaign_audios ENABLE ROW LEVEL SECURITY;

-- RLS: owner of the campaign can manage audios
CREATE POLICY "Users manage own campaign audios"
ON public.voice_campaign_audios
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.voice_campaigns
    WHERE voice_campaigns.id = voice_campaign_audios.campaign_id
    AND voice_campaigns.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.voice_campaigns
    WHERE voice_campaigns.id = voice_campaign_audios.campaign_id
    AND voice_campaigns.user_id = auth.uid()
  )
);

-- Make audio_url nullable on voice_campaigns for new multi-audio campaigns
ALTER TABLE public.voice_campaigns ALTER COLUMN audio_url DROP NOT NULL;
