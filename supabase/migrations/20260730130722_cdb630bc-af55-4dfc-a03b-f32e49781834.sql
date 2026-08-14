-- 1. Trigger-only functions: EXECUTE is checked at CREATE TRIGGER, not at fire time.
REVOKE EXECUTE ON FUNCTION public.apply_throttle_on_first_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_throttle_on_order_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_provision_group_ordrup_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_provision_venue_ordrup_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_table_session_insert_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_order_push_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_initial_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_venue_display_areas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_venue_order_statuses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_venue_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_refresh_diner_stats_from_visit() FROM PUBLIC, anon, authenticated;

-- 2. Background / service-role-only functions: no client should call these.
REVOKE EXECUTE ON FUNCTION public.ack_job(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_job(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_pos_job(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_api_key(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_idle_web_sessions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maintain_log_partitions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_monthly_partition(regclass, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_api_idempotency() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_throttle_on_order_insert_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated;

-- 3. Staff/admin-only functions: remove anonymous (signed-out) execute.
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ar_dashboard(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_financials(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_performance(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_venue_admin_detail(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_admin_venues(text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_ar_invoices(text[], uuid, text, date, date, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_menu_item_food_costs(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_venue_performance(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.migrate_loyalty_balances_to_program(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_pos_credential(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_venue_pos_secret_refs(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_primary_venue(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_venue_with_owner(text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_audit_date(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.initialize_venue_audit_date(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_stripe_customer_for_venue(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_venue_pos_integration_meta(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_venue_payment_config_meta(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pair_display_terminal(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unpair_display_terminal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_loyalty_program_balance(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_sibling_venues(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.migrate_loyalty_balances_to_program(uuid, uuid, boolean) FROM PUBLIC, anon;

-- 4. ai_model_prices: internal cost data -> admins only.
DROP POLICY IF EXISTS "Anyone authed can read prices" ON public.ai_model_prices;
CREATE POLICY "Admins can read prices" ON public.ai_model_prices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::app_role));

-- 5. api_idempotency: service-role writes only.
REVOKE INSERT, UPDATE, DELETE ON public.api_idempotency FROM anon, authenticated;
REVOKE SELECT ON public.api_idempotency FROM anon;
GRANT ALL ON public.api_idempotency TO service_role;

-- 6. venue_staff: managers must not be able to edit or demote owner rows.
DROP POLICY IF EXISTS "Managers can update staff" ON public.venue_staff;
CREATE POLICY "Managers can update staff" ON public.venue_staff
  FOR UPDATE TO authenticated
  USING (
    public.is_venue_manager(auth.uid(), venue_id)
    AND (
      role <> 'owner'::venue_staff_role
      OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.venue_staff vs2
        WHERE vs2.venue_id = venue_staff.venue_id
          AND vs2.user_id = auth.uid()
          AND vs2.role = 'owner'::venue_staff_role
          AND vs2.is_active = true
      )
    )
  )
  WITH CHECK (
    public.is_venue_manager(auth.uid(), venue_id)
    AND venue_id = (SELECT vs.venue_id FROM public.venue_staff vs WHERE vs.id = venue_staff.id)
    AND user_id = (SELECT vs.user_id FROM public.venue_staff vs WHERE vs.id = venue_staff.id)
    AND (
      role <> 'owner'::venue_staff_role
      OR public.has_role(auth.uid(), 'tabless_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.venue_staff vs2
        WHERE vs2.venue_id = venue_staff.venue_id
          AND vs2.user_id = auth.uid()
          AND vs2.role = 'owner'::venue_staff_role
          AND vs2.is_active = true
      )
    )
  );