-- Criar tabela de fila de mensagens WhatsApp
CREATE TABLE public.whatsapp_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE CASCADE NOT NULL,
  tipo_lembrete text NOT NULL,
  telefone text NOT NULL,
  mensagem text NOT NULL,
  agendado_para timestamp with time zone NOT NULL,
  status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro')),
  erro_mensagem text,
  criado_em timestamp with time zone DEFAULT now(),
  enviado_em timestamp with time zone,
  UNIQUE(pagamento_id, tipo_lembrete)
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_fila ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (apenas admins podem ver)
CREATE POLICY "Admins podem gerenciar fila whatsapp" 
ON public.whatsapp_fila 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous access to whatsapp_fila" 
ON public.whatsapp_fila 
FOR ALL 
USING (false)
WITH CHECK (false);