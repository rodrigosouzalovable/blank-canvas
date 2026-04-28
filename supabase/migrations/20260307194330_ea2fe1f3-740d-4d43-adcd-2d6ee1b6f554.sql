
-- Tabela de sessões gravadas
CREATE TABLE public.cobmais_sessoes_gravadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  total_passos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'gravando',
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);

ALTER TABLE public.cobmais_sessoes_gravadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar sessoes_gravadas"
  ON public.cobmais_sessoes_gravadas FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Deny anonymous access to sessoes_gravadas"
  ON public.cobmais_sessoes_gravadas FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Tabela de conhecimento (passos aprendidos)
CREATE TABLE public.cobmais_conhecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid REFERENCES public.cobmais_sessoes_gravadas(id) ON DELETE CASCADE NOT NULL,
  nome_fluxo text NOT NULL,
  passo_numero integer NOT NULL,
  descricao_tela text,
  acao text NOT NULL,
  seletor text,
  valor text,
  url_pagina text,
  screenshot_description text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cobmais_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar cobmais_conhecimento"
  ON public.cobmais_conhecimento FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Deny anonymous access to cobmais_conhecimento"
  ON public.cobmais_conhecimento FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
