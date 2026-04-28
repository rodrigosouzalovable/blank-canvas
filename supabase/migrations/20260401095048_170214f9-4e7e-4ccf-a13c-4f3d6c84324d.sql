CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  IF to_jsonb(NEW) ? 'atualizado_em' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('atualizado_em', now()));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;