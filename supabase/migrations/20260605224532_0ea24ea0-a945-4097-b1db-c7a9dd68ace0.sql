
DROP POLICY IF EXISTS venues_select_active_public ON public.venues;

CREATE POLICY venues_select_active_anon
  ON public.venues
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY venues_select_active_authenticated
  ON public.venues
  FOR SELECT
  TO authenticated
  USING (is_active = true);

COMMENT ON POLICY venues_select_active_anon ON public.venues IS
  'Anon can SELECT active venues. Sensitive columns (email, phone, subscription_status, subscription_plan, subscription_notes) are blocked at the column-grant level — anon has no SELECT privilege on them. Admin-only data must be fetched via get_venue_admin_detail RPC.';

COMMENT ON POLICY venues_select_active_authenticated ON public.venues IS
  'Authenticated users can SELECT active venues. Sensitive columns (email, phone, subscription_*) are blocked at the column-grant level for the authenticated role. Use get_venue_admin_detail RPC for admin views.';
