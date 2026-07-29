-- 1. Restore missing EXECUTE grants (parity with production)
GRANT EXECUTE ON FUNCTION public._payment_secret_column(_field text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_throttle_on_first_item() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_throttle_on_order_insert() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_throttle_on_order_insert_for(_order_id uuid, _venue_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_order_to_campaign(_order_id uuid, _token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_provision_group_ordrup_rewards() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_provision_venue_ordrup_rewards() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_table_session(_venue_id uuid, _table_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_loyalty_program_balance(_user_id uuid, _program_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_idle_web_sessions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_max_3_category_areas() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_max_3_item_areas() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_table_session_insert_limits() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_order_push_on_insert() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_monthly_partition(_parent regclass, _month date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_diner_segment(_segment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_site_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_diner_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(_user_id uuid, _group_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(_user_id uuid, _group_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_order_initial_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_diner_venue_stats(_diner_id uuid, _venue_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_refresh_diner_stats_from_visit() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon, authenticated;

-- 2. Secret readers: admin/service_role only.
REVOKE EXECUTE ON FUNCTION public.read_pos_credential(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_api_webhook_secret(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_payment_secret(uuid, text)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_payment_secret(uuid, text)  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pos_webhook_secret(uuid)    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_pos_webhook_secret(uuid)    TO authenticated;

-- 3. Other functions where this project granted anon but production does not.
REVOKE EXECUTE ON FUNCTION public.create_api_webhook(uuid, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_api_webhook(uuid, uuid, text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_api_webhooks_safe()            FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_api_webhooks_safe()            TO authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_diner_segment_members(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_diner_segment_members(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_payment_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_payment_secret(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pos_webhook_secret(uuid, text)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_pos_webhook_secret(uuid, text)  TO authenticated;