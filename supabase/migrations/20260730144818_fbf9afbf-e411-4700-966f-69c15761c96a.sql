
-- 1) crm_suppression: allow venue staff read access for compliance checks
DROP POLICY IF EXISTS "Staff view suppression for their venue" ON public.crm_suppression;
CREATE POLICY "Staff view suppression for their venue"
ON public.crm_suppression FOR SELECT TO authenticated
USING (venue_id IS NOT NULL AND public.is_venue_staff(auth.uid(), venue_id));

-- 2) diner_profiles: remove broad manager PII read; replace with field-limited RPC
DROP POLICY IF EXISTS "Managers can view diners via visits" ON public.diner_profiles;

CREATE OR REPLACE FUNCTION public.list_venue_diner_profiles(_venue_ids uuid[])
RETURNS TABLE(id uuid, display_name text, email text, phone text, allergens text[], preferences jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT dp.id, dp.display_name, dp.email, dp.phone, dp.allergens, dp.preferences
  FROM public.diner_profiles dp
  JOIN public.diner_visits dv ON dv.diner_id = dp.id
  JOIN public.venues v ON v.id = dv.venue_id
  WHERE v.id = ANY(_venue_ids)
    AND (
      public.has_role(auth.uid(), 'tabless_admin'::app_role)
      OR public.is_venue_manager(auth.uid(), v.id)
      OR (v.group_id IS NOT NULL AND public.is_group_admin(auth.uid(), v.group_id))
    );
$$;

REVOKE ALL ON FUNCTION public.list_venue_diner_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_venue_diner_profiles(uuid[]) TO authenticated, service_role;

-- 3) venue-assets storage: require a strict <uuid>/... path before casting
DROP POLICY IF EXISTS "Staff can upload venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update venue image assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete venue assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view venue assets" ON storage.objects;

CREATE POLICY "Staff can upload venue image assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-assets'
  AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
  AND (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can update venue image assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+'
  AND (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
)
WITH CHECK (
  bucket_id = 'venue-assets'
  AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|svg|avif)$'
  AND (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can delete venue assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+'
  AND (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

CREATE POLICY "Staff can view venue assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'venue-assets'
  AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+'
  AND (
    public.has_role(auth.uid(), 'tabless_admin'::app_role)
    OR public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
  )
);

-- 4) Remove signed-out EXECUTE on definer functions that already demand a signed-in user
REVOKE EXECUTE ON FUNCTION public.enroll_diner_in_loyalty(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_diner_profile_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fire_table_session(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_table_session(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_terminal_by_token(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.heartbeat_display_terminal(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_diner_in_loyalty(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_diner_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fire_table_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_table_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_terminal_by_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_display_terminal(uuid) TO authenticated, service_role;
