-- Shared dish-image library + per-venue AI image generation cap (Kent,
-- 2026-08-25). A thousand pubs don't need a thousand renderings of chicken
-- parmigiana: the first generation of a dish is stored platform-wide, keyed by
-- a normalised dish name, and every later venue with a matching item reuses it
-- at zero AI cost. AI generation itself is capped per venue (default 100,
-- admin-raisable) and counted from ai_usage_log.

CREATE TABLE public.dish_image_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalised name (lowercased, parentheticals stripped, alphanumerics only);
  -- the batch function owns the normalisation.
  dish_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','curated')),
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_dish_image_library_updated_at
  BEFORE UPDATE ON public.dish_image_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dish_image_library ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dish_image_library TO authenticated;
GRANT ALL ON public.dish_image_library TO service_role;

CREATE POLICY "Anyone signed in reads the library" ON public.dish_image_library
  FOR SELECT TO authenticated USING (true);

-- Platform admins may curate (replace bad generations, upload stock photos).
CREATE POLICY "Admins curate the library" ON public.dish_image_library
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

-- Reuse counter, bumped by the batch function per application.
CREATE OR REPLACE FUNCTION public.bump_dish_image_usage(_dish_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE dish_image_library
  SET usage_count = usage_count + 1
  WHERE dish_key = _dish_key;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_dish_image_usage(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_dish_image_usage(TEXT) TO service_role;

-- Per-venue AI generation allowance. Library reuse is never counted — only
-- actual provider calls (rows in ai_usage_log) draw it down.
ALTER TABLE public.venue_feature_flags
  ADD COLUMN image_gen_limit INT NOT NULL DEFAULT 100;
