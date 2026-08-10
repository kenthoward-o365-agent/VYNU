-- Expose a venue's package configuration to the guest ordering app.
--
-- The guest app currently shows every feature regardless of the venue's
-- package, because it has no way to read one. Both RLS policies on
-- venue_feature_flags are TO authenticated -- one for tabless_admin, one for
-- venue staff -- so an anonymous diner gets nothing back and the app has
-- nothing to gate on.
--
-- This adds a narrow read path. Same pattern as is_active_venue and
-- can_append_guest_order_item: a SECURITY DEFINER function returning only what
-- the caller needs, rather than granting read access to the table.
--
-- What it returns and why:
--
--   The tier and the raw override map, not resolved booleans. Resolution
--   (tier preset + per-venue overrides) currently lives in TypeScript, in
--   src/lib/packages.ts and again in supabase/functions/_shared/require-feature.ts.
--   Resolving here would mean a third copy of the package rules in SQL, and
--   those two copies have already drifted -- the client defaults an
--   unprovisioned venue to bite while the server defaults it to feast. Adding a
--   third would make that worse, so the caller resolves using the existing
--   shared logic.
--
--   When the presets are consolidated into the database (separate ticket), this
--   function should return resolved booleans instead and stop exposing the tier.
--
-- Exposure: a venue's package tier and which flags it has overridden. No diner,
-- order or financial data. The venue id is already in the QR URL the guest
-- scanned.

CREATE OR REPLACE FUNCTION public.get_venue_package_public(_venue_id uuid)
RETURNS TABLE (tier text, flags jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vff.tier::text, COALESCE(vff.flags, '{}'::jsonb)
    FROM public.venue_feature_flags vff
   WHERE vff.venue_id = _venue_id
$$;

COMMENT ON FUNCTION public.get_venue_package_public(uuid) IS
  'Returns a venue''s package tier and per-venue flag overrides so the guest ordering app can hide features the venue''s package excludes. Returns no rows when the venue has no package configured; callers must apply the same default the server uses in _shared/require-feature.ts, or client and server will disagree. Exposes no diner, order or financial data.';

REVOKE ALL ON FUNCTION public.get_venue_package_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_package_public(uuid) TO anon, authenticated, service_role;