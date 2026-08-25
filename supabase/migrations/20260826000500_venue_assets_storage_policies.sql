-- Fix venue-assets storage RLS: client uploads were impossible (Kent hit this
-- uploading a menu photo, 2026-08-25). Two independent breaks:
--
--   1. The replayed policies only allowed paths shaped `{venue-uuid}/...`,
--      but the app uploads to `menu-items/{venueId}/...` and
--      `landing/{venueId}/...` — no client path could ever match.
--   2. They called is_venue_staff(), whose EXECUTE was revoked from
--      `authenticated` on 2026-07-30 (internal-helper hardening), so even a
--      matching path errored.
--
-- Edge functions upload with service_role (bypasses RLS), which is why
-- generated/library images worked while staff uploads failed. New policies:
-- inline EXISTS on venue_staff (the codebase's standard pattern), the real
-- path shapes (plus the legacy bare-uuid form for pre-existing objects), and
-- the same image-extension allowlist as before. `library/dishes/**` stays
-- service-role/admin-only — venues read it via the public bucket URL.

DROP POLICY IF EXISTS "Staff can upload venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete venue assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view venue assets" ON storage.objects;

-- True when the object path belongs to a venue the caller actively staffs:
--   menu-items/{venue}/…  |  landing/{venue}/…  |  {venue}/…  (legacy)
-- SECURITY DEFINER so it may consult venue_staff regardless of the caller's
-- table grants; EXECUTE restricted to authenticated.
CREATE OR REPLACE FUNCTION public.staff_owns_asset_path(_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH seg AS (
    SELECT CASE
      WHEN _name ~* '^(menu-items|landing)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+'
        THEN (string_to_array(_name, '/'))[2]::uuid
      WHEN _name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+'
        THEN (string_to_array(_name, '/'))[1]::uuid
      ELSE NULL
    END AS venue_id
  )
  SELECT EXISTS (
    SELECT 1 FROM venue_staff vs, seg
    WHERE seg.venue_id IS NOT NULL
      AND vs.venue_id = seg.venue_id
      AND vs.user_id = auth.uid()
      AND vs.is_active = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public.staff_owns_asset_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_owns_asset_path(TEXT) TO authenticated, service_role;

CREATE POLICY "Staff upload venue assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'venue-assets'
    AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
    AND (public.has_role(auth.uid(), 'tabless_admin') OR public.staff_owns_asset_path(name))
  );

CREATE POLICY "Staff update venue assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'venue-assets'
    AND (public.has_role(auth.uid(), 'tabless_admin') OR public.staff_owns_asset_path(name))
  )
  WITH CHECK (
    bucket_id = 'venue-assets'
    AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
    AND (public.has_role(auth.uid(), 'tabless_admin') OR public.staff_owns_asset_path(name))
  );

CREATE POLICY "Staff delete venue assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'venue-assets'
    AND (public.has_role(auth.uid(), 'tabless_admin') OR public.staff_owns_asset_path(name))
  );
