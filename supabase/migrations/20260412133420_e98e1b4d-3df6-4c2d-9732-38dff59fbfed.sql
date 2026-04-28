ALTER TABLE public.whatsapp_aquecimento_instancias 
ADD COLUMN ultimo_parceiro_id uuid REFERENCES public.user_whatsapp_instances(id) DEFAULT NULL;