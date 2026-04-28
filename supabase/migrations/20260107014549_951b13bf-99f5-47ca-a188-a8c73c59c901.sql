-- Adicionar coluna de habilitação de WhatsApp na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN whatsapp_lembretes_habilitado boolean NOT NULL DEFAULT false;

-- Criar tabela de log de mensagens enviadas
CREATE TABLE public.whatsapp_lembretes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE CASCADE NOT NULL,
  tipo_lembrete text NOT NULL,
  enviado_em timestamp with time zone DEFAULT now(),
  sucesso boolean DEFAULT true,
  erro_mensagem text,
  UNIQUE(pagamento_id, tipo_lembrete)
);

-- Habilitar RLS na tabela de logs
ALTER TABLE public.whatsapp_lembretes_log ENABLE ROW LEVEL SECURITY;

-- Policy para admins gerenciarem logs
CREATE POLICY "Admins podem ver todos os logs de whatsapp"
ON public.whatsapp_lembretes_log
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy para bloquear acesso anônimo
CREATE POLICY "Deny anonymous access to whatsapp_lembretes_log"
ON public.whatsapp_lembretes_log
FOR ALL
TO anon
USING (false)
WITH CHECK (false);