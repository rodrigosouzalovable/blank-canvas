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
  SELECT d.id, d.nome, d.cpf, d.credor, d.contrato,
         d.valor_original, d.valor_atualizado, d.estagio, d.telefone,
         d.data_vencimento, d.descricao,
         EXISTS (
           SELECT 1 FROM public.acordos a
           WHERE public.cpf_normalize(a.cliente_cpf) = public.cpf_normalize(d.cpf)
             AND a.status = 'ativo'
         ) AS tem_acordo
  FROM public.devedores d
  WHERE d.ativo = true
    AND d.credor = p_credor
  ORDER BY tem_acordo DESC, d.nome ASC
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.listar_devedores_por_credor(text) TO authenticated;