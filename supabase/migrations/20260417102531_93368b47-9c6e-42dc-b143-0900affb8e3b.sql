-- Index acordos by normalized cpf for fast EXISTS lookup
CREATE INDEX IF NOT EXISTS idx_acordos_cpf_normalize ON public.acordos (public.cpf_normalize(cliente_cpf)) WHERE status = 'ativo';

-- Index devedores by credor for fast filtering
CREATE INDEX IF NOT EXISTS idx_devedores_credor_ativo ON public.devedores (credor) WHERE ativo = true;

-- Rewrite RPC: compute the set of CPFs with active agreements ONCE (CTE), then LEFT JOIN. 
-- Avoids 1k+ correlated EXISTS subqueries.
CREATE OR REPLACE FUNCTION public.listar_devedores_por_credor(p_credor text)
RETURNS TABLE(
  id uuid,
  nome text,
  cpf text,
  credor text,
  contrato text,
  valor_original numeric,
  valor_atualizado numeric,
  estagio text,
  telefone text,
  data_vencimento date,
  descricao text,
  tem_acordo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cpfs_com_acordo AS (
    SELECT DISTINCT public.cpf_normalize(a.cliente_cpf) AS cpf_n
    FROM public.acordos a
    WHERE a.status = 'ativo'
  )
  SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
         d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
         d.data_vencimento, d.descricao,
         (c.cpf_n IS NOT NULL) AS tem_acordo
  FROM public.devedores d
  LEFT JOIN cpfs_com_acordo c ON c.cpf_n = public.cpf_normalize(d.cpf)
  WHERE d.ativo = true
    AND d.credor = p_credor
  ORDER BY (c.cpf_n IS NOT NULL) DESC, d.nome ASC
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.listar_devedores_por_credor(text) TO authenticated;