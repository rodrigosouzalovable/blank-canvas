-- 1. Coluna de arquivamento em whatsapp_contatos
ALTER TABLE public.whatsapp_contatos
  ADD COLUMN IF NOT EXISTS arquivado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contatos_arquivado
  ON public.whatsapp_contatos(instancia_id, arquivado, ultima_mensagem_em DESC);

-- 2. Telefone da instância
ALTER TABLE public.user_whatsapp_instances
  ADD COLUMN IF NOT EXISTS telefone text;

CREATE INDEX IF NOT EXISTS idx_user_whatsapp_instances_telefone_suffix
  ON public.user_whatsapp_instances ((right(regexp_replace(coalesce(telefone,''),'\D','','g'), 8)))
  WHERE ativo = true AND telefone IS NOT NULL;

-- 3. Função e trigger de auto-arquivamento de conversas internas
CREATE OR REPLACE FUNCTION public.auto_arquivar_contato_interno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  suf text;
BEGIN
  suf := right(regexp_replace(coalesce(NEW.telefone,''),'\D','','g'), 8);
  IF suf IS NULL OR length(suf) < 8 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_whatsapp_instances i
    WHERE i.ativo = true
      AND i.telefone IS NOT NULL
      AND right(regexp_replace(i.telefone,'\D','','g'), 8) = suf
      AND i.id <> NEW.instancia_id
  ) THEN
    NEW.arquivado := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_arquivar_contato_interno ON public.whatsapp_contatos;
CREATE TRIGGER trg_auto_arquivar_contato_interno
BEFORE INSERT OR UPDATE OF telefone ON public.whatsapp_contatos
FOR EACH ROW EXECUTE FUNCTION public.auto_arquivar_contato_interno();