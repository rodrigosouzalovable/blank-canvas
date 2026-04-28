-- Criar tabela para histórico de auditorias
CREATE TABLE public.auditoria_divergencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  arquivo_nome TEXT NOT NULL,
  
  -- Dados da Planilha Cobmais
  cpf_planilha TEXT NOT NULL,
  nome_planilha TEXT,
  valor_planilha NUMERIC,
  receita_planilha NUMERIC,
  data_planilha TEXT,
  parcela_planilha INTEGER,
  
  -- Dados do Sistema
  nome_sistema TEXT,
  valor_sistema NUMERIC,
  receita_sistema NUMERIC,
  data_sistema TEXT,
  parcela_sistema INTEGER,
  
  -- Informações da Divergência
  tipo_divergencia TEXT NOT NULL,
  pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL,
  
  -- Status e Usuário
  resolvido BOOLEAN DEFAULT false,
  resolvido_em TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Criar índices para performance
CREATE INDEX idx_auditoria_divergencias_user_id ON public.auditoria_divergencias(user_id);
CREATE INDEX idx_auditoria_divergencias_arquivo ON public.auditoria_divergencias(arquivo_nome);
CREATE INDEX idx_auditoria_divergencias_cpf ON public.auditoria_divergencias(cpf_planilha);
CREATE INDEX idx_auditoria_divergencias_criado_em ON public.auditoria_divergencias(criado_em DESC);

-- Habilitar RLS
ALTER TABLE public.auditoria_divergencias ENABLE ROW LEVEL SECURITY;

-- Política para admins verem tudo
CREATE POLICY "Admins podem ver todas as auditorias"
ON public.auditoria_divergencias
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política para admins inserirem
CREATE POLICY "Admins podem inserir auditorias"
ON public.auditoria_divergencias
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política para admins atualizarem
CREATE POLICY "Admins podem atualizar auditorias"
ON public.auditoria_divergencias
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Política para admins excluírem
CREATE POLICY "Admins podem excluir auditorias"
ON public.auditoria_divergencias
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);