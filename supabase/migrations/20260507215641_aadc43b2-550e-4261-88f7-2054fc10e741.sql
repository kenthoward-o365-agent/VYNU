-- White label brands
CREATE TABLE public.white_label_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  -- Hosts
  app_host text UNIQUE,
  consumer_host text UNIQUE,
  api_host text,
  marketing_host text,
  -- Brand assets
  logo_primary_url text,
  logo_mono_white_url text,
  logo_mono_black_url text,
  favicon_url text,
  app_icon_url text,
  og_image_url text,
  -- Theme (HSL token overrides)
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Copy
  product_name text NOT NULL,
  tagline text,
  support_email text,
  support_url text,
  legal_company_name text,
  privacy_url text,
  terms_url text,
  -- Feature toggles
  show_developers_page boolean NOT NULL DEFAULT true,
  show_knowledge_base boolean NOT NULL DEFAULT true,
  show_powered_by boolean NOT NULL DEFAULT false,
  enabled_pos_providers text[] NOT NULL DEFAULT '{}'::text[],
  -- Knowledge base overrides
  kb_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Auth email
  auth_email_from text,
  auth_email_reply_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one default brand
CREATE UNIQUE INDEX white_label_brands_one_default
  ON public.white_label_brands ((is_default)) WHERE is_default = true;

ALTER TABLE public.white_label_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brands"
  ON public.white_label_brands FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage brands"
  ON public.white_label_brands FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE TRIGGER trg_white_label_brands_updated_at
  BEFORE UPDATE ON public.white_label_brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pin venues to a brand (optional)
ALTER TABLE public.venues
  ADD COLUMN white_label_brand_id uuid REFERENCES public.white_label_brands(id) ON DELETE SET NULL;

CREATE INDEX idx_venues_white_label_brand_id ON public.venues(white_label_brand_id);

-- Seed Shyndig as default brand
INSERT INTO public.white_label_brands (
  slug, name, is_default, product_name, tagline,
  app_host, consumer_host, api_host, marketing_host,
  support_email, legal_company_name,
  show_developers_page, show_knowledge_base, show_powered_by,
  enabled_pos_providers
) VALUES (
  'shyndig',
  'Shyndig',
  true,
  'Shyndig',
  'The agentic dining platform',
  'shyndig.lovable.app',
  'shyndig.lovable.app',
  'api.shyndig.io',
  'shyndig.com.au',
  'support@shyndig.com',
  'Shyndig Pty Ltd',
  true, true, false,
  ARRAY[]::text[]
);