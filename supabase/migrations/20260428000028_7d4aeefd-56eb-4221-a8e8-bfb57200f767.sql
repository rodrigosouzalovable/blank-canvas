CREATE TABLE public.whatsapp_dialogos_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'texto',
  contexto text NOT NULL,
  gatilho text[] NOT NULL DEFAULT '{}',
  resposta text NOT NULL,
  fase_minima int NOT NULL DEFAULT 1,
  peso int NOT NULL DEFAULT 1,
  vezes_utilizada int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialogos_contexto_ativo
  ON public.whatsapp_dialogos_pool (contexto, ativo, fase_minima);
CREATE INDEX idx_dialogos_gatilho_gin
  ON public.whatsapp_dialogos_pool USING GIN (gatilho);

ALTER TABLE public.whatsapp_dialogos_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_dialogos_pool" ON public.whatsapp_dialogos_pool
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE TABLE public.whatsapp_dialogos_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogo_id uuid NOT NULL REFERENCES public.whatsapp_dialogos_pool(id) ON DELETE CASCADE,
  numero_destino text NOT NULL,
  usado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dialogos_uso_dest_time
  ON public.whatsapp_dialogos_uso (numero_destino, usado_em DESC);

ALTER TABLE public.whatsapp_dialogos_uso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_dialogos_uso" ON public.whatsapp_dialogos_uso
  FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

-- Seed: saudações iniciais
INSERT INTO public.whatsapp_dialogos_pool (contexto, resposta, peso, fase_minima) VALUES
('inicial', 'Oi! Tudo bem?', 10, 1),
('inicial', 'Olá, como você está?', 8, 1),
('inicial', 'Bom dia! Como vai?', 7, 1),
('inicial', 'Boa tarde!', 6, 1),
('inicial', 'Boa noite!', 6, 1),
('inicial', 'Fala aí, beleza?', 5, 2),
('inicial', 'Coe, firmeza?', 5, 2),
('inicial', 'E aí, tranquilo?', 5, 2),
('inicial', 'Opa, tudo certo?', 7, 1),
('inicial', 'Salve, como cê tá?', 4, 3),
('inicial', 'Fala, parceiro!', 4, 3);

-- Seed: respostas com gatilho "tudo bem / como você / como vai"
INSERT INTO public.whatsapp_dialogos_pool (contexto, gatilho, resposta, peso, fase_minima) VALUES
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Tudo sim, e você?', 10, 1),
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Tudo certo por aqui!', 8, 1),
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Estou bem, graças a Deus', 7, 2),
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Estou bem, e contigo?', 8, 2),
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Também estou bem, obrigado!', 6, 2),
('resposta', ARRAY['tudo','bem','como','voce','vai','vc'], 'Tô bem, e vc?', 9, 1);

-- Seed: respostas com gatilho "fazendo / trabalhando / ocupado"
INSERT INTO public.whatsapp_dialogos_pool (contexto, gatilho, resposta, peso, fase_minima) VALUES
('resposta', ARRAY['fazendo','trabalhando','fazer'], 'Só trabalhando, e vc?', 8, 2),
('resposta', ARRAY['fazendo','trabalhando','fazer'], 'Tô aqui na luta', 7, 2),
('resposta', ARRAY['fazendo','trabalhando','fazer'], 'Resolvendo uns problemas', 5, 3),
('resposta', ARRAY['fazendo','trabalhando','fazer'], 'Descansando um pouco', 4, 2),
('resposta', ARRAY['ocupado'], 'Tô ocupado, mas sempre tenho tempo pra responder', 6, 3);

-- Seed: respostas com gatilho "legal / bom / otimo / bacana"
INSERT INTO public.whatsapp_dialogos_pool (contexto, gatilho, resposta, peso, fase_minima) VALUES
('resposta', ARRAY['legal','bom','otimo','show'], 'Pois é, a vida segue', 6, 2),
('resposta', ARRAY['legal','bom','otimo','show'], 'Verdade, tem que aproveitar', 5, 2),
('resposta', ARRAY['legal','bom','otimo','show'], 'Fico feliz que gostou', 4, 3),
('resposta', ARRAY['bacana'], 'Massa, né?', 6, 2);

-- Seed: respostas com gatilho "obrigado / valeu"
INSERT INTO public.whatsapp_dialogos_pool (contexto, gatilho, resposta, peso, fase_minima) VALUES
('resposta', ARRAY['obrigado','valeu','vlw','gratidao'], 'Por nada!', 10, 1),
('resposta', ARRAY['obrigado','valeu','vlw','gratidao'], 'Disponha!', 7, 2),
('resposta', ARRAY['obrigado','valeu','vlw','gratidao'], 'Que isso, tamo junto!', 8, 2),
('resposta', ARRAY['obrigado','valeu','vlw','gratidao'], 'Imagine, estamos aí', 6, 2);

-- Seed: respostas com gatilho "não sei / descobri"
INSERT INTO public.whatsapp_dialogos_pool (contexto, gatilho, resposta, peso, fase_minima) VALUES
('resposta', ARRAY['sei','nao'], 'Também tô na mesma', 6, 2),
('resposta', ARRAY['sei','nao'], 'Vamos tentar resolver', 5, 3),
('resposta', ARRAY['descobri','descobriu'], 'Aos poucos a gente descobre', 5, 3);

-- Seed: respostas coringa
INSERT INTO public.whatsapp_dialogos_pool (contexto, resposta, peso, fase_minima) VALUES
('coringa', 'Ah legal!', 10, 1),
('coringa', 'Massa!', 9, 1),
('coringa', 'Bacana', 8, 2),
('coringa', 'Que legal!', 8, 2),
('coringa', 'Entendi', 7, 2),
('coringa', 'Imagino', 6, 3),
('coringa', 'Pode crer', 7, 3),
('coringa', 'Verdade', 8, 2),
('coringa', 'Faz sentido', 6, 3),
('coringa', 'É isso aí', 7, 3);

-- Seed: encerramentos
INSERT INTO public.whatsapp_dialogos_pool (contexto, resposta, peso, fase_minima) VALUES
('encerramento', 'Preciso ir, falo depois! 👍', 10, 1),
('encerramento', 'Vou ali resolver um negócio, depois volto', 8, 2),
('encerramento', 'Agora não posso falar, responde mais tarde?', 7, 2),
('encerramento', 'Legal o papo, mas tô ocupado agora', 6, 3),
('encerramento', 'Depois a gente conversa, valeu!', 9, 1);

-- Cron: purga uso > 48h
SELECT cron.schedule(
  'purge-whatsapp-dialogos-uso',
  '15 6 * * *',
  $$ DELETE FROM public.whatsapp_dialogos_uso WHERE usado_em < now() - interval '48 hours'; $$
);