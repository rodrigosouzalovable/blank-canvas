
-- Função trigger para acordos_devedor (fluxo novo)
CREATE OR REPLACE FUNCTION public.atualizar_estagio_montreal_acordo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ativo' THEN
    UPDATE public.devedores
    SET estagio = 'Acordo'
    WHERE public.cpf_normalize(cpf) = public.cpf_normalize(NEW.devedor_cpf)
      AND credor ILIKE '%montreal%'
      AND ativo = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estagio_montreal_acordo ON public.acordos_devedor;
CREATE TRIGGER trg_estagio_montreal_acordo
AFTER INSERT ON public.acordos_devedor
FOR EACH ROW EXECUTE FUNCTION public.atualizar_estagio_montreal_acordo();

-- Função trigger para acordos (fluxo antigo)
CREATE OR REPLACE FUNCTION public.atualizar_estagio_montreal_acordo_old()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ativo' AND NEW.cliente_cpf IS NOT NULL THEN
    UPDATE public.devedores
    SET estagio = 'Acordo'
    WHERE public.cpf_normalize(cpf) = public.cpf_normalize(NEW.cliente_cpf)
      AND credor ILIKE '%montreal%'
      AND ativo = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estagio_montreal_acordo_old ON public.acordos;
CREATE TRIGGER trg_estagio_montreal_acordo_old
AFTER INSERT ON public.acordos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_estagio_montreal_acordo_old();

-- Backfill: aplica a regra retroativamente
UPDATE public.devedores
SET estagio = 'Acordo'
WHERE credor ILIKE '%montreal%'
  AND ativo = true
  AND public.cpf_normalize(cpf) IN (
    SELECT public.cpf_normalize(devedor_cpf) FROM public.acordos_devedor WHERE status = 'ativo'
    UNION
    SELECT public.cpf_normalize(cliente_cpf) FROM public.acordos WHERE status = 'ativo' AND cliente_cpf IS NOT NULL
  );
