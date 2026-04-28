-- Criar tabela de retornos
CREATE TABLE public.retornos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_cpf TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  observacao TEXT,
  data_retorno DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.retornos ENABLE ROW LEVEL SECURITY;

-- Negar acesso anônimo
CREATE POLICY "Deny anonymous access to retornos" ON public.retornos
  FOR ALL USING (false) WITH CHECK (false);

-- Usuários podem ver seus próprios retornos
CREATE POLICY "Usuários podem ver seus próprios retornos" ON public.retornos
  FOR SELECT USING (auth.uid() = user_id);

-- Usuários podem criar seus próprios retornos
CREATE POLICY "Usuários podem criar seus próprios retornos" ON public.retornos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Usuários podem atualizar seus próprios retornos
CREATE POLICY "Usuários podem atualizar seus próprios retornos" ON public.retornos
  FOR UPDATE USING (auth.uid() = user_id);

-- Usuários podem deletar seus próprios retornos
CREATE POLICY "Usuários podem deletar seus próprios retornos" ON public.retornos
  FOR DELETE USING (auth.uid() = user_id);

-- Admins podem ver todos os retornos
CREATE POLICY "Admins podem ver todos os retornos" ON public.retornos
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Gestores podem ver retornos da equipe
CREATE POLICY "Gestores podem ver retornos da equipe" ON public.retornos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.gestor_id = auth.uid()
      AND team_members.funcionario_id = retornos.user_id
    )
  );

-- Trigger para atualizar atualizado_em
CREATE TRIGGER update_retornos_updated_at
  BEFORE UPDATE ON public.retornos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();