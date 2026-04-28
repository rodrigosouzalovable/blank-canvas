
-- Table for client agreements
CREATE TABLE public.acordos_devedor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  devedor_cpf text NOT NULL,
  valor_total numeric NOT NULL,
  num_parcelas integer NOT NULL,
  data_primeiro_vencimento date NOT NULL,
  criado_por uuid NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ativo'
);

-- Table for agreement installments
CREATE TABLE public.parcelas_devedor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acordo_id uuid NOT NULL REFERENCES public.acordos_devedor(id) ON DELETE CASCADE,
  numero_parcela integer NOT NULL,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  pago boolean NOT NULL DEFAULT false,
  data_pagamento date,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.acordos_devedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas_devedor ENABLE ROW LEVEL SECURITY;

-- Policies for acordos_devedor
CREATE POLICY "Admins podem gerenciar acordos_devedor" ON public.acordos_devedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Usuarios autenticados podem ver acordos_devedor" ON public.acordos_devedor FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Usuarios autenticados podem criar acordos_devedor" ON public.acordos_devedor FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = criado_por);
CREATE POLICY "Usuarios autenticados podem atualizar acordos_devedor" ON public.acordos_devedor FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Policies for parcelas_devedor
CREATE POLICY "Admins podem gerenciar parcelas_devedor" ON public.parcelas_devedor FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Usuarios autenticados podem ver parcelas_devedor" ON public.parcelas_devedor FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Usuarios autenticados podem criar parcelas_devedor" ON public.parcelas_devedor FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Usuarios autenticados podem atualizar parcelas_devedor" ON public.parcelas_devedor FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
