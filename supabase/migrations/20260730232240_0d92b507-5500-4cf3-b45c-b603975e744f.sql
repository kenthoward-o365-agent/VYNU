-- 1. venue_zones / venue_menus: public read only for live, active venues
DROP POLICY IF EXISTS venue_zones_public_read ON public.venue_zones;
CREATE POLICY venue_zones_public_read ON public.venue_zones
FOR SELECT USING (
  is_active AND EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = venue_zones.venue_id AND v.is_active AND v.is_live
  )
);

DROP POLICY IF EXISTS venue_menus_public_read ON public.venue_menus;
CREATE POLICY venue_menus_public_read ON public.venue_menus
FOR SELECT USING (
  is_active AND EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = venue_menus.venue_id AND v.is_active AND v.is_live
  )
);

-- 2. venue_tab_zones (legacy): staff/admin only
DROP POLICY IF EXISTS tab_zones_public_read ON public.venue_tab_zones;
CREATE POLICY tab_zones_staff_read ON public.venue_tab_zones
FOR SELECT TO authenticated USING (
  public.is_venue_staff(auth.uid(), venue_id)
  OR public.has_role(auth.uid(), 'tabless_admin'::public.app_role)
);
REVOKE ALL ON public.venue_tab_zones FROM anon;

-- 3. api_partners: admin-only, fail closed at grant level
REVOKE ALL ON public.api_partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_partners TO authenticated;
GRANT ALL ON public.api_partners TO service_role;

-- 4. SECURITY DEFINER functions that must never be callable from the API
DO $$
DECLARE fn text; sig text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'get_payment_secret','set_payment_secret','get_pos_webhook_secret','set_pos_webhook_secret',
    'set_pos_credential','update_venue_pos_secret_refs','migrate_loyalty_balances_to_program',
    'refresh_diner_segment_members','evaluate_diner_segment','attribute_order_to_campaign',
    'ensure_stripe_customer_for_venue'
  ] LOOP
    FOR sig IN
      SELECT p.oid::regprocedure::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
  END LOOP;

  -- admin/operator-only functions: block anonymous callers, keep signed-in access
  FOREACH fn IN ARRAY ARRAY[
    'get_platform_financials','get_platform_performance','get_admin_dashboard','get_ar_dashboard',
    'list_ar_invoices','search_admin_venues','get_venue_admin_detail','get_venue_performance',
    'create_api_webhook','list_api_webhooks_safe','create_venue_with_owner','advance_audit_date',
    'initialize_venue_audit_date','get_venue_audit_date','list_venue_diner_profiles',
    'get_menu_item_food_costs','get_venue_pos_integration_meta','get_venue_payment_config_meta',
    'set_default_menu_id','set_primary_venue','list_sibling_venues','can_manage_loyalty_program_balance'
  ] LOOP
    FOR sig IN
      SELECT p.oid::regprocedure::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
    END LOOP;
  END LOOP;
END $$;