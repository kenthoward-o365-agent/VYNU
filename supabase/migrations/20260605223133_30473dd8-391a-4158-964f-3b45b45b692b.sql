
-- venues: keep only the non-sensitive columns readable (sensitive: email, phone, subscription_*)
REVOKE SELECT ON public.venues FROM anon, authenticated;
GRANT SELECT (
  id, name, venue_type, address, city, state, postcode, country, logo_url,
  operating_hours, timezone, settings, is_active, created_at, updated_at,
  group_id, landing_page_html, site_id, menu_source, is_live, went_live_at
) ON public.venues TO anon, authenticated;

-- venue_payment_config: hide gateway secrets, keep operational fields for staff/manager queries
REVOKE SELECT ON public.venue_payment_config FROM anon, authenticated;
GRANT SELECT (
  id, venue_id, provider, environment, merchant_account, is_active,
  created_at, updated_at, apple_pay_merchant_id, google_pay_merchant_id,
  capture_mode, statement_descriptor, country_code, default_currency,
  merchant_status, merchant_id_ordrpay
) ON public.venue_payment_config TO authenticated;
-- Anon gets no direct read access; CheckoutPanel will rely on the
-- get_venue_payment_active SECURITY DEFINER function instead.

-- venue_pos_integrations: hide secret refs and token cache
REVOKE SELECT ON public.venue_pos_integrations FROM anon, authenticated;
GRANT SELECT (
  id, venue_id, pos_provider, endpoint_url, last_sync_at, sync_status, config,
  created_at, updated_at, location_id, account_id, client_id, provider_id,
  connection_status, last_error, breaker_state, breaker_failures, breaker_opened_at,
  sync_pos_to_us, sync_us_to_pos, last_menu_pull_at, last_webhook_at, auto_push_orders
) ON public.venue_pos_integrations TO authenticated;

-- api_webhooks: hide the signing secret
REVOKE SELECT ON public.api_webhooks FROM anon, authenticated;
GRANT SELECT (
  id, partner_id, venue_id, url, events, is_active,
  last_delivery_at, last_delivery_status, created_at, updated_at
) ON public.api_webhooks TO authenticated;

-- menu_items: hide internal cost / POS reference columns from anon (staff still see all)
REVOKE SELECT ON public.menu_items FROM anon;
GRANT SELECT (
  id, venue_id, category_id, name, description, price, prep_time_minutes,
  allergens, dietary_tags, image_url, is_available, display_order,
  image_ai_status, snooze_until, created_at, updated_at
) ON public.menu_items TO anon;
