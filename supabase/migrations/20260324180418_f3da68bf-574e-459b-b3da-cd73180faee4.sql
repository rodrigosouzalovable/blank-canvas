
-- Create voice_campaigns table
CREATE TABLE public.voice_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.voice_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaigns" ON public.voice_campaigns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create voice_campaign_contacts table
CREATE TABLE public.voice_campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.voice_campaigns(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  enviado_em TIMESTAMP WITH TIME ZONE,
  erro_mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_campaign_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaign contacts" ON public.voice_campaign_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_campaigns WHERE id = campaign_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_campaigns WHERE id = campaign_id AND user_id = auth.uid()));

-- Create storage bucket for campaign audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-audio', 'campaign-audio', true);

CREATE POLICY "Users can upload audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public can read campaign audio" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'campaign-audio');

CREATE POLICY "Users can delete own audio" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
