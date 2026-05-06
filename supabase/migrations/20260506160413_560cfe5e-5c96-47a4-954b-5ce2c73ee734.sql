
-- Provider registry
CREATE TABLE public.pos_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  auth_type text NOT NULL CHECK (auth_type IN ('oauth2','api_key','hmac','jwt')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  webhook_url_template text,
  docs_url text,
  status text NOT NULL DEFAULT 'alpha' CHECK (status IN ('alpha','beta','ga','deprecated')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pos_providers" ON public.pos_providers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Authenticated can view active providers" ON public.pos_providers
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_pos_providers_updated
  BEFORE UPDATE ON public.pos_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend venue_pos_integrations with provider_id + connection state
ALTER TABLE public.venue_pos_integrations
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.pos_providers(id),
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'disconnected'
    CHECK (connection_status IN ('disconnected','connecting','connected','error')),
  ADD COLUMN IF NOT EXISTS last_error text;

-- Seed providers
INSERT INTO public.pos_providers (slug, name, auth_type, status, capabilities, config_schema, docs_url) VALUES
('doshii','Doshii','jwt','ga',
  '{"menu_push":true,"menu_pull":true,"orders_push":true,"orders_pull":true,"snooze":true}'::jsonb,
  '[
    {"key":"location_id","label":"Doshii Location ID","type":"text","required":true},
    {"key":"location_token","label":"Location Token","type":"secret","required":true}
  ]'::jsonb,
  'https://docs.doshii.io/'),
('hl_exceed','H&L Exceed','api_key','alpha',
  '{"menu_pull":true,"orders_push":true,"snooze":true}'::jsonb,
  '[
    {"key":"site_id","label":"Site ID","type":"text","required":true},
    {"key":"api_key","label":"API Key","type":"secret","required":true}
  ]'::jsonb, null),
('lightspeed','Lightspeed','oauth2','alpha',
  '{"menu_pull":true,"orders_push":true}'::jsonb,
  '[{"key":"account_id","label":"Account ID","type":"text","required":true}]'::jsonb,
  'https://developers.lightspeedhq.com/'),
('square','Square','oauth2','alpha',
  '{"menu_pull":true,"orders_push":true,"payments":true}'::jsonb,
  '[{"key":"location_id","label":"Square Location ID","type":"text","required":true}]'::jsonb,
  'https://developer.squareup.com/'),
('mock','Mock Provider (dev)','api_key','beta',
  '{"menu_push":true,"menu_pull":true,"orders_push":true,"orders_pull":true,"snooze":true}'::jsonb,
  '[{"key":"label","label":"Label","type":"text","required":false}]'::jsonb, null);

-- Backfill existing integrations to providers by slug
UPDATE public.venue_pos_integrations vpi
SET provider_id = p.id
FROM public.pos_providers p
WHERE vpi.provider_id IS NULL AND p.slug = vpi.pos_provider;
