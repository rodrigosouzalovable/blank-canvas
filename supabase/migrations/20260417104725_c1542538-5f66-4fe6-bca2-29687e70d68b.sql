
-- Função: ao deletar de acordos_devedor, se não restar acordo ativo p/ o CPF, volta estágio para "Novo" (apenas MONTREAL)
CREATE OR REPLACE FUNCTION public.reverter_estagio_montreal_delete_acordo_devedor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.acordos_devedor
    WHERE cpf_normalize(devedor_cpf) = cpf_normalize(OLD.devedor_cpf)
      AND status = 'ativo'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.acordos
    WHERE cliente_cpf IS NOT NULL
      AND cpf_normalize(cliente_cpf) = cpf_normalize(OLD.devedor_cpf)
      AND status = 'ativo'
  ) THEN
    UPDATE public.devedores
    SET estagio = 'Novo'
    WHERE cpf_normalize(cpf) = cpf_normalize(OLD.devedor_cpf)
      AND credor ILIKE '%montreal%'
      AND ativo = true
      AND estagio = 'Acordo';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverter_estagio_montreal_delete_dev ON public.acordos_devedor;
CREATE TRIGGER trg_reverter_estagio_montreal_delete_dev
AFTER DELETE ON public.acordos_devedor
FOR EACH ROW EXECUTE FUNCTION public.reverter_estagio_montreal_delete_acordo_devedor();

-- Função análoga para tabela acordos (fluxo antigo)
CREATE OR REPLACE FUNCTION public.reverter_estagio_montreal_delete_acordo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.cliente_cpf IS NULL THEN RETURN OLD; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.acordos
    WHERE cliente_cpf IS NOT NULL
      AND cpf_normalize(cliente_cpf) = cpf_normalize(OLD.cliente_cpf)
      AND status = 'ativo'
      AND id <> OLD.id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.acordos_devedor
    WHERE cpf_normalize(devedor_cpf) = cpf_normalize(OLD.cliente_cpf)
      AND status = 'ativo'
  ) THEN
    UPDATE public.devedores
    SET estagio = 'Novo'
    WHERE cpf_normalize(cpf) = cpf_normalize(OLD.cliente_cpf)
      AND credor ILIKE '%montreal%'
      AND ativo = true
      AND estagio = 'Acordo';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverter_estagio_montreal_delete_ac ON public.acordos;
CREATE TRIGGER trg_reverter_estagio_montreal_delete_ac
AFTER DELETE ON public.acordos
FOR EACH ROW EXECUTE FUNCTION public.reverter_estagio_montreal_delete_acordo();

-- Backfill: qualquer cliente MONTREAL com estágio "Acordo" mas sem acordo ativo volta para "Novo"
UPDATE public.devedores d
SET estagio = 'Novo'
WHERE d.credor ILIKE '%montreal%'
  AND d.ativo = true
  AND d.estagio = 'Acordo'
  AND NOT EXISTS (
    SELECT 1 FROM public.acordos_devedor ad
    WHERE cpf_normalize(ad.devedor_cpf) = cpf_normalize(d.cpf)
      AND ad.status = 'ativo'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.acordos a
    WHERE a.cliente_cpf IS NOT NULL
      AND cpf_normalize(a.cliente_cpf) = cpf_normalize(d.cpf)
      AND a.status = 'ativo'
  );
