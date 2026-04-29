
-- 1) Tabela whatsapp_contatos_agenda_salvos
CREATE TABLE IF NOT EXISTS public.whatsapp_contatos_agenda_salvos (
  instancia_id uuid NOT NULL,
  numero_destino text NOT NULL,
  nome_salvo text,
  salvo_em timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (instancia_id, numero_destino)
);

CREATE INDEX IF NOT EXISTS idx_wa_agenda_salvos_instancia
  ON public.whatsapp_contatos_agenda_salvos(instancia_id);

ALTER TABLE public.whatsapp_contatos_agenda_salvos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem agenda salvos" ON public.whatsapp_contatos_agenda_salvos;
CREATE POLICY "Admins veem agenda salvos"
  ON public.whatsapp_contatos_agenda_salvos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Deny anonymous access" ON public.whatsapp_contatos_agenda_salvos;
CREATE POLICY "Deny anonymous access"
  ON public.whatsapp_contatos_agenda_salvos
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 2) RPC chatbot_append_buffer
CREATE OR REPLACE FUNCTION public.chatbot_append_buffer(
  p_telefone text, p_texto text, p_timestamp timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE chatbot_conversas
  SET mensagens_pendentes = array_append(COALESCE(mensagens_pendentes, '{}'), p_texto),
      ultimo_webhook_em = p_timestamp
  WHERE telefone = p_telefone;
END;
$$;

-- 3) RPC get_table_ddl
CREATE OR REPLACE FUNCTION public.get_table_ddl(p_table text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ddl text := '';
  v_cols text := '';
  v_pk text := '';
  v_rls text := '';
  v_rec record;
  v_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN '-- table public.' || quote_ident(p_table) || ' not found';
  END IF;

  FOR v_rec IN
    SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table
    ORDER BY ordinal_position
  LOOP
    v_cols := v_cols || E'\n  '
      || quote_ident(v_rec.column_name) || ' '
      || CASE
           WHEN v_rec.data_type = 'ARRAY' THEN regexp_replace(v_rec.udt_name, '^_', '') || '[]'
           WHEN v_rec.data_type = 'USER-DEFINED' THEN v_rec.udt_name
           WHEN v_rec.data_type = 'character varying' AND v_rec.character_maximum_length IS NOT NULL
             THEN 'varchar(' || v_rec.character_maximum_length || ')'
           ELSE v_rec.data_type
         END
      || CASE WHEN v_rec.column_default IS NOT NULL THEN ' DEFAULT ' || v_rec.column_default ELSE '' END
      || CASE WHEN v_rec.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
      || ',';
  END LOOP;

  SELECT '  CONSTRAINT ' || quote_ident(tc.constraint_name)
         || ' PRIMARY KEY (' || string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) || ')'
    INTO v_pk
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public' AND tc.table_name = p_table AND tc.constraint_type = 'PRIMARY KEY'
  GROUP BY tc.constraint_name;

  v_ddl := '-- ============================================' || E'\n'
        || '-- Table: public.' || quote_ident(p_table) || E'\n'
        || '-- ============================================' || E'\n'
        || 'CREATE TABLE IF NOT EXISTS public.' || quote_ident(p_table) || ' (' || v_cols;

  IF v_pk IS NOT NULL THEN
    v_ddl := v_ddl || E'\n' || v_pk || E'\n);';
  ELSE
    v_ddl := rtrim(v_ddl, ',') || E'\n);';
  END IF;

  v_ddl := v_ddl || E'\n\nALTER TABLE public.' || quote_ident(p_table) || ' ENABLE ROW LEVEL SECURITY;';

  FOR v_rec IN
    SELECT polname, polcmd, polpermissive, polroles, polqual, polwithcheck
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table
    ORDER BY polname
  LOOP
    DECLARE
      v_cmd text; v_using text; v_check text;
    BEGIN
      v_cmd := CASE v_rec.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE 'ALL' END;
      v_using := CASE WHEN v_rec.polqual IS NOT NULL
        THEN ' USING (' || pg_get_expr(v_rec.polqual, (SELECT oid FROM pg_class WHERE relname = p_table AND relnamespace = 'public'::regnamespace)) || ')' ELSE '' END;
      v_check := CASE WHEN v_rec.polwithcheck IS NOT NULL
        THEN ' WITH CHECK (' || pg_get_expr(v_rec.polwithcheck, (SELECT oid FROM pg_class WHERE relname = p_table AND relnamespace = 'public'::regnamespace)) || ')' ELSE '' END;
      v_rls := v_rls || E'\n\nCREATE POLICY ' || quote_ident(v_rec.polname)
            || ' ON public.' || quote_ident(p_table)
            || CASE WHEN v_rec.polpermissive THEN ' AS PERMISSIVE' ELSE ' AS RESTRICTIVE' END
            || ' FOR ' || v_cmd || v_using || v_check || ';';
    END;
  END LOOP;

  v_ddl := v_ddl || v_rls || E'\n';
  RETURN v_ddl;
END;
$$;

REVOKE ALL ON FUNCTION public.get_table_ddl(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_table_ddl(text) TO authenticated;

-- 4) Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('devedor-arquivos', 'devedor-arquivos', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-audio', 'campaign-audio', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('inbox-media', 'inbox-media', true)
  ON CONFLICT (id) DO NOTHING;

-- Policies devedor-arquivos
DROP POLICY IF EXISTS "Usuarios autenticados podem fazer upload devedor" ON storage.objects;
CREATE POLICY "Usuarios autenticados podem fazer upload devedor" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'devedor-arquivos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuarios autenticados podem ver arquivos devedor" ON storage.objects;
CREATE POLICY "Usuarios autenticados podem ver arquivos devedor" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'devedor-arquivos' AND auth.uid() IS NOT NULL);

-- Policies campaign-audio
DROP POLICY IF EXISTS "Users can upload campaign audio" ON storage.objects;
CREATE POLICY "Users can upload campaign audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own campaign audio" ON storage.objects;
CREATE POLICY "Users can read own campaign audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public can read campaign audio" ON storage.objects;
CREATE POLICY "Public can read campaign audio" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'campaign-audio');

DROP POLICY IF EXISTS "Users can delete own campaign audio" ON storage.objects;
CREATE POLICY "Users can delete own campaign audio" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policies inbox-media
DROP POLICY IF EXISTS "Public read inbox-media" ON storage.objects;
CREATE POLICY "Public read inbox-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'inbox-media');

DROP POLICY IF EXISTS "Authenticated upload inbox-media" ON storage.objects;
CREATE POLICY "Authenticated upload inbox-media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inbox-media');

DROP POLICY IF EXISTS "Authenticated delete inbox-media" ON storage.objects;
CREATE POLICY "Authenticated delete inbox-media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'inbox-media');
