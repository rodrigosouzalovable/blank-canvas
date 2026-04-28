
CREATE POLICY "Admins can manage all instances"
  ON public.user_whatsapp_instances
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
