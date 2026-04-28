-- 1) BACKFILL: marcar como "Acordo" todos os devedores cujo CPF/CNPJ tem acordo direto
UPDATE public.devedores d
SET estagio = 'Acordo'
WHERE d.ativo = true
  AND d.estagio <> 'Acordo'
  AND (
    EXISTS (
      SELECT 1 FROM public.acordos a
      WHERE a.cliente_cpf IS NOT NULL
        AND public.cpf_normalize(a.cliente_cpf) = public.cpf_normalize(d.cpf)
        AND a.status IN ('ativo','concluido')
    )
    OR EXISTS (
      SELECT 1 FROM public.acordos_devedor ad
      WHERE public.cpf_normalize(ad.devedor_cpf) = public.cpf_normalize(d.cpf)
        AND ad.status = 'ativo'
    )
  );

-- 2) BACKFILL via grupo empresarial: se algum membro do grupo tem acordo, marcar todos
UPDATE public.devedores d
SET estagio = 'Acordo'
WHERE d.ativo = true
  AND d.estagio <> 'Acordo'
  AND public.cpf_normalize(d.cpf) IN (
    SELECT g2.cpf_cnpj
    FROM public.grupo_empresarial_membros g1
    JOIN public.grupo_empresarial_membros g2 ON g2.grupo_id = g1.grupo_id
    WHERE g1.cpf_cnpj IN (
      SELECT public.cpf_normalize(cliente_cpf) FROM public.acordos
       WHERE cliente_cpf IS NOT NULL AND status IN ('ativo','concluido')
      UNION
      SELECT public.cpf_normalize(devedor_cpf) FROM public.acordos_devedor WHERE status = 'ativo'
    )
  );

-- 3) Substitui trigger function antigo (Montreal-only) por versão genérica + propagação para grupo
CREATE OR REPLACE FUNCTION public.atualizar_estagio_acordo_devedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf_norm text;
  v_grupo uuid;
BEGIN
  IF NEW.status = 'ativo' THEN
    v_cpf_norm := public.cpf_normalize(NEW.devedor_cpf);

    -- Marca o próprio CPF
    UPDATE public.devedores
    SET estagio = 'Acordo'
    WHERE public.cpf_normalize(cpf) = v_cpf_norm
      AND ativo = true
      AND estagio <> 'Acordo';

    -- Propaga para todos os membros do grupo empresarial (se houver)
    SELECT grupo_id INTO v_grupo
    FROM public.grupo_empresarial_membros
    WHERE cpf_cnpj = v_cpf_norm
    LIMIT 1;

    IF v_grupo IS NOT NULL THEN
      UPDATE public.devedores
      SET estagio = 'Acordo'
      WHERE ativo = true
        AND estagio <> 'Acordo'
        AND public.cpf_normalize(cpf) IN (
          SELECT cpf_cnpj FROM public.grupo_empresarial_membros WHERE grupo_id = v_grupo
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_estagio_acordo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf_norm text;
  v_grupo uuid;
BEGIN
  IF NEW.status IN ('ativo','concluido') AND NEW.cliente_cpf IS NOT NULL THEN
    v_cpf_norm := public.cpf_normalize(NEW.cliente_cpf);

    UPDATE public.devedores
    SET estagio = 'Acordo'
    WHERE public.cpf_normalize(cpf) = v_cpf_norm
      AND ativo = true
      AND estagio <> 'Acordo';

    SELECT grupo_id INTO v_grupo
    FROM public.grupo_empresarial_membros
    WHERE cpf_cnpj = v_cpf_norm
    LIMIT 1;

    IF v_grupo IS NOT NULL THEN
      UPDATE public.devedores
      SET estagio = 'Acordo'
      WHERE ativo = true
        AND estagio <> 'Acordo'
        AND public.cpf_normalize(cpf) IN (
          SELECT cpf_cnpj FROM public.grupo_empresarial_membros WHERE grupo_id = v_grupo
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Recria triggers usando as novas funções genéricas
DROP TRIGGER IF EXISTS trg_atualizar_estagio_montreal_acordo_devedor ON public.acordos_devedor;
DROP TRIGGER IF EXISTS atualizar_estagio_montreal_acordo_devedor_trigger ON public.acordos_devedor;
CREATE TRIGGER trg_atualizar_estagio_acordo_devedor
AFTER INSERT OR UPDATE ON public.acordos_devedor
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_estagio_acordo_devedor();

DROP TRIGGER IF EXISTS trg_atualizar_estagio_montreal_acordo ON public.acordos;
DROP TRIGGER IF EXISTS atualizar_estagio_montreal_acordo_trigger ON public.acordos;
CREATE TRIGGER trg_atualizar_estagio_acordo
AFTER INSERT OR UPDATE ON public.acordos
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_estagio_acordo();