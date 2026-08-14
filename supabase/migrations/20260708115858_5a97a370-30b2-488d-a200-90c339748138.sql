
-- Package + feature flags per venue
CREATE TABLE IF NOT EXISTS public.venue_feature_flags (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'feast' CHECK (tier IN ('bite','plate','feast','custom')),
  flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.venue_feature_flags TO authenticated;
GRANT ALL ON public.venue_feature_flags TO service_role;

ALTER TABLE public.venue_feature_flags ENABLE ROW LEVEL SECURITY;

-- Venue staff can read their venue's flags
CREATE POLICY "Staff read own venue flags"
  ON public.venue_feature_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_staff vs
      WHERE vs.venue_id = venue_feature_flags.venue_id
        AND vs.user_id = auth.uid()
        AND vs.is_active = true
    )
    OR public.has_role(auth.uid(), 'tabless_admin')
  );

-- Only H&L admins can write
CREATE POLICY "Admins manage venue flags"
  ON public.venue_feature_flags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

-- updated_at trigger
CREATE TRIGGER trg_venue_feature_flags_updated_at
  BEFORE UPDATE ON public.venue_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed every existing venue at Feast tier with empty flags map (client resolves via preset)
INSERT INTO public.venue_feature_flags (venue_id, tier, flags)
SELECT id, 'feast', '{}'::jsonb FROM public.venues
ON CONFLICT (venue_id) DO NOTHING;
