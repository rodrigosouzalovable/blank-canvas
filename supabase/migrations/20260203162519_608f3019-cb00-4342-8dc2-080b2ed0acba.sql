-- Criar tabela para armazenar metas mensais
CREATE TABLE public.metas_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ano TEXT NOT NULL UNIQUE,
  valor NUMERIC NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.metas_mensais ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos autenticados
CREATE POLICY "Usuários autenticados podem ver metas"
  ON public.metas_mensais FOR SELECT TO authenticated USING (true);

-- Política de INSERT para admins
CREATE POLICY "Admins podem inserir metas"
  ON public.metas_mensais FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Política de UPDATE para admins
CREATE POLICY "Admins podem atualizar metas"
  ON public.metas_mensais FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Política de DELETE para admins
CREATE POLICY "Admins podem deletar metas"
  ON public.metas_mensais FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para atualizar timestamp
CREATE TRIGGER update_metas_mensais_updated_at
  BEFORE UPDATE ON public.metas_mensais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();