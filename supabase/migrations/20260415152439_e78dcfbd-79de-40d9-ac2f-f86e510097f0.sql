
-- Helper function to check instance ownership without RLS recursion
CREATE OR REPLACE FUNCTION public.owns_whatsapp_instance(inst_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_whatsapp_instances
    WHERE id = inst_id
      AND user_id = auth.uid()
  )
$$;

-- whatsapp_aquecimento_instancias: user can SELECT own
CREATE POLICY "Users can view own warming instances"
ON public.whatsapp_aquecimento_instancias
FOR SELECT
TO authenticated
USING (owns_whatsapp_instance(instancia_id));

-- whatsapp_aquecimento_instancias: user can UPDATE own
CREATE POLICY "Users can update own warming instances"
ON public.whatsapp_aquecimento_instancias
FOR UPDATE
TO authenticated
USING (owns_whatsapp_instance(instancia_id));

-- whatsapp_aquecimento_interacoes: user can SELECT where origin or dest is theirs
CREATE POLICY "Users can view own warming interactions"
ON public.whatsapp_aquecimento_interacoes
FOR SELECT
TO authenticated
USING (owns_whatsapp_instance(instancia_origem_id) OR owns_whatsapp_instance(instancia_destino_id));

-- whatsapp_aquecimento_agendamentos: user can SELECT where origin or dest is theirs
CREATE POLICY "Users can view own warming schedules"
ON public.whatsapp_aquecimento_agendamentos
FOR SELECT
TO authenticated
USING (owns_whatsapp_instance(instancia_origem_id) OR owns_whatsapp_instance(instancia_destino_id));

-- whatsapp_aquecimento_status_log: user can SELECT own
CREATE POLICY "Users can view own warming status logs"
ON public.whatsapp_aquecimento_status_log
FOR SELECT
TO authenticated
USING (owns_whatsapp_instance(instancia_id));

-- aquecimento_notificacoes: user can SELECT own
CREATE POLICY "Users can view own warming notifications"
ON public.aquecimento_notificacoes
FOR SELECT
TO authenticated
USING (owns_whatsapp_instance(instancia_id));

-- aquecimento_notificacoes: user can UPDATE own (mark as read)
CREATE POLICY "Users can update own warming notifications"
ON public.aquecimento_notificacoes
FOR UPDATE
TO authenticated
USING (owns_whatsapp_instance(instancia_id));
