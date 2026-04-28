ALTER TABLE voice_campaign_contacts 
  ADD COLUMN IF NOT EXISTS call_id TEXT,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration INTEGER,
  ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'audio_message';

ALTER TABLE voice_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'audio_message';