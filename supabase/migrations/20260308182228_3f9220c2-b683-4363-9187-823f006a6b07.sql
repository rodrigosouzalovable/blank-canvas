
CREATE POLICY "Authenticated users can upsert chatbot_conversas"
ON public.chatbot_conversas
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
