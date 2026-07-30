-- venue-assets is intentionally a public CDN bucket for branding/menu imagery.
-- Restrict what may be placed in it to non-sensitive image assets only, so
-- documents can never be uploaded into a publicly readable location.
DROP POLICY IF EXISTS "Staff can upload venue assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update venue assets" ON storage.objects;

CREATE POLICY "Staff can upload venue image assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-assets'
  AND public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
);

CREATE POLICY "Staff can update venue image assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'venue-assets'
  AND public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
);