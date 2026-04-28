-- Criar enum para papéis de usuário
CREATE TYPE public.app_role AS ENUM ('funcionario', 'gestor', 'admin');

-- Criar tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de papéis de usuário (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'funcionario',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Criar tabela de acordos
CREATE TABLE public.acordos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_nome TEXT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  parcelas INTEGER NOT NULL CHECK (parcelas > 0),
  valor_parcela DECIMAL(12,2) NOT NULL,
  data_primeiro_pagamento DATE NOT NULL,
  dias_atraso INTEGER NOT NULL CHECK (dias_atraso >= 0),
  percentual_comissao INTEGER NOT NULL,
  comissao_total DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de pagamentos (parcelas)
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_id UUID NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  data_prevista DATE NOT NULL,
  data_paga DATE,
  valor_parcela DECIMAL(12,2) NOT NULL,
  comissao_parcela DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (acordo_id, numero_parcela)
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- Função para verificar papel do usuário (SECURITY DEFINER para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para criar perfil e papel automaticamente no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', 'Usuário'), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'funcionario');
  
  RETURN NEW;
END;
$$;

-- Trigger para criar perfil automaticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers para atualizar timestamp
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_acordos_updated_at
  BEFORE UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies para profiles
CREATE POLICY "Usuários podem ver seu próprio perfil"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies para user_roles (somente leitura para usuários)
CREATE POLICY "Usuários podem ver seus próprios papéis"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies para acordos
CREATE POLICY "Funcionários podem ver seus próprios acordos"
  ON public.acordos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Funcionários podem criar seus próprios acordos"
  ON public.acordos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Funcionários podem atualizar seus próprios acordos"
  ON public.acordos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Funcionários podem deletar seus próprios acordos"
  ON public.acordos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies para pagamentos
CREATE POLICY "Usuários podem ver pagamentos de seus acordos"
  ON public.pagamentos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = pagamentos.acordo_id
        AND acordos.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem criar pagamentos para seus acordos"
  ON public.pagamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = pagamentos.acordo_id
        AND acordos.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem atualizar pagamentos de seus acordos"
  ON public.pagamentos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = pagamentos.acordo_id
        AND acordos.user_id = auth.uid()
    )
  );