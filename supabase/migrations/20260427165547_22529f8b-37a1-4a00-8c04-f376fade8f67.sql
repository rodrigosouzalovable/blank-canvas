DROP TRIGGER IF EXISTS trg_auto_arquivar_contato_interno ON public.whatsapp_contatos;
DROP FUNCTION IF EXISTS public.auto_arquivar_contato_interno() CASCADE;