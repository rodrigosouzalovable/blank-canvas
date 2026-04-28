ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS mensagens_pendentes text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ultimo_webhook_em timestamptz;