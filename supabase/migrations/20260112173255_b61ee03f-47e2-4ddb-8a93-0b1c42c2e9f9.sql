-- Adicionar coluna para rastrear quando o WhatsApp foi enviado
ALTER TABLE public.retornos ADD COLUMN whatsapp_enviado_em TIMESTAMPTZ DEFAULT NULL;