-- Tabela para gastos gerais da empresa
CREATE TABLE public.gastos_empresa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  data_referencia DATE NOT NULL,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para gastos por funcionário
CREATE TABLE public.gastos_funcionarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  data_referencia DATE NOT NULL,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gastos_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_funcionarios ENABLE ROW LEVEL SECURITY;

-- Policies para gastos_empresa (apenas admins)
CREATE POLICY "Admins podem ver gastos da empresa"
ON public.gastos_empresa
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem inserir gastos da empresa"
ON public.gastos_empresa
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem atualizar gastos da empresa"
ON public.gastos_empresa
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem deletar gastos da empresa"
ON public.gastos_empresa
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Policies para gastos_funcionarios (apenas admins)
CREATE POLICY "Admins podem ver gastos de funcionarios"
ON public.gastos_funcionarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem inserir gastos de funcionarios"
ON public.gastos_funcionarios
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem atualizar gastos de funcionarios"
ON public.gastos_funcionarios
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins podem deletar gastos de funcionarios"
ON public.gastos_funcionarios
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);