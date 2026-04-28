
-- Table: whatsapp_mensagens
CREATE TABLE public.whatsapp_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  telefone_remoto text NOT NULL,
  nome_contato text,
  conteudo text NOT NULL DEFAULT '',
  direcao text NOT NULL DEFAULT 'entrada',
  timestamp_msg timestamp with time zone NOT NULL DEFAULT now(),
  lida boolean NOT NULL DEFAULT false,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_whatsapp_mensagens_instancia_telefone ON public.whatsapp_mensagens(instancia_id, telefone_remoto);
CREATE INDEX idx_whatsapp_mensagens_timestamp ON public.whatsapp_mensagens(timestamp_msg DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

-- RLS: admins see all
CREATE POLICY "Admins podem gerenciar whatsapp_mensagens"
  ON public.whatsapp_mensagens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: users see messages from their own instances
CREATE POLICY "Usuarios veem mensagens das suas instancias"
  ON public.whatsapp_mensagens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_whatsapp_instances
    WHERE user_whatsapp_instances.id = whatsapp_mensagens.instancia_id
      AND user_whatsapp_instances.user_id = auth.uid()
  ));

-- RLS: deny anon
CREATE POLICY "Deny anonymous access to whatsapp_mensagens"
  ON public.whatsapp_mensagens FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;

-- Table: whatsapp_contatos
CREATE TABLE public.whatsapp_contatos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia_id uuid NOT NULL REFERENCES public.user_whatsapp_instances(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  nome text,
  ultima_mensagem text,
  ultima_mensagem_em timestamp with time zone,
  nao_lido integer NOT NULL DEFAULT 0,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(instancia_id, telefone)
);

-- Enable RLS
ALTER TABLE public.whatsapp_contatos ENABLE ROW LEVEL SECURITY;

-- RLS: admins see all
CREATE POLICY "Admins podem gerenciar whatsapp_contatos"
  ON public.whatsapp_contatos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: users see contacts from their own instances
CREATE POLICY "Usuarios veem contatos das suas instancias"
  ON public.whatsapp_contatos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_whatsapp_instances
    WHERE user_whatsapp_instances.id = whatsapp_contatos.instancia_id
      AND user_whatsapp_instances.user_id = auth.uid()
  ));

-- RLS: deny anon
CREATE POLICY "Deny anonymous access to whatsapp_contatos"
  ON public.whatsapp_contatos FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contatos;
