
CREATE TABLE public.metas_funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mes_ano text NOT NULL,
  valor_meta numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mes_ano)
);

ALTER TABLE public.metas_funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metas" ON public.metas_funcionarios
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metas" ON public.metas_funcionarios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metas" ON public.metas_funcionarios
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all metas" ON public.metas_funcionarios
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
