
-- Add inbox_compartilhado column
ALTER TABLE public.user_permissions
ADD COLUMN inbox_compartilhado boolean NOT NULL DEFAULT false;

-- Create helper function
CREATE OR REPLACE FUNCTION public.has_inbox_compartilhado(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND inbox_compartilhado = true
  )
$$;

-- Allow shared inbox users to SELECT all whatsapp instances
CREATE POLICY "Shared inbox users can view all instances"
ON public.user_whatsapp_instances
FOR SELECT
TO authenticated
USING (public.has_inbox_compartilhado(auth.uid()));

-- Allow shared inbox users to SELECT all contacts
CREATE POLICY "Shared inbox users can view all contacts"
ON public.whatsapp_contatos
FOR SELECT
TO authenticated
USING (public.has_inbox_compartilhado(auth.uid()));

-- Allow shared inbox users to UPDATE contacts (mark as read)
CREATE POLICY "Shared inbox users can update all contacts"
ON public.whatsapp_contatos
FOR UPDATE
TO authenticated
USING (public.has_inbox_compartilhado(auth.uid()));

-- Allow shared inbox users to SELECT all messages
CREATE POLICY "Shared inbox users can view all messages"
ON public.whatsapp_mensagens
FOR SELECT
TO authenticated
USING (public.has_inbox_compartilhado(auth.uid()));

-- Allow shared inbox users to INSERT messages (to reply)
CREATE POLICY "Shared inbox users can insert messages"
ON public.whatsapp_mensagens
FOR INSERT
TO authenticated
WITH CHECK (public.has_inbox_compartilhado(auth.uid()));
