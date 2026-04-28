CREATE OR REPLACE FUNCTION public.chatbot_append_buffer(p_telefone text, p_texto text, p_timestamp timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE chatbot_conversas
  SET mensagens_pendentes = array_append(COALESCE(mensagens_pendentes, '{}'), p_texto),
      ultimo_webhook_em = p_timestamp
  WHERE telefone = p_telefone;
  
  -- If no row exists yet, we just skip (the conversation will be created later)
  -- But if it does exist, we've buffered the message
END;
$$;