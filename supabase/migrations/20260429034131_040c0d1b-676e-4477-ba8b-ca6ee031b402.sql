-- FK pagamentos -> acordos (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pagamentos_acordo_id_fkey'
      AND conrelid = 'public.pagamentos'::regclass
  ) THEN
    -- Limpa órfãos antes de criar a FK
    DELETE FROM public.pagamentos
    WHERE acordo_id IS NOT NULL
      AND acordo_id NOT IN (SELECT id FROM public.acordos);

    ALTER TABLE public.pagamentos
      ADD CONSTRAINT pagamentos_acordo_id_fkey
      FOREIGN KEY (acordo_id) REFERENCES public.acordos(id) ON DELETE CASCADE;
  END IF;
END$$;

-- FK gastos_funcionarios.funcionario_id -> profiles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gastos_funcionarios_funcionario_id_fkey'
      AND conrelid = 'public.gastos_funcionarios'::regclass
  ) THEN
    DELETE FROM public.gastos_funcionarios
    WHERE funcionario_id NOT IN (SELECT id FROM public.profiles);

    ALTER TABLE public.gastos_funcionarios
      ADD CONSTRAINT gastos_funcionarios_funcionario_id_fkey
      FOREIGN KEY (funcionario_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END$$;