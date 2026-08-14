DROP POLICY IF EXISTS "Staff can upload venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete venue assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view venue assets" ON storage.objects;

CREATE POLICY "Staff can upload venue image assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-assets'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
  AND (
    public.has_role(auth.uid(), 'tabless_admin')
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can update venue image assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND (
    public.has_role(auth.uid(), 'tabless_admin')
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
)
WITH CHECK (
  bucket_id = 'venue-assets'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
  AND (
    public.has_role(auth.uid(), 'tabless_admin')
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can delete venue assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND (
    public.has_role(auth.uid(), 'tabless_admin')
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can view venue assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND (
    public.has_role(auth.uid(), 'tabless_admin')
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);