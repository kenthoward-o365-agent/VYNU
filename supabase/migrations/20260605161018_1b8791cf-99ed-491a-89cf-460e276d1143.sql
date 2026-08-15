
REVOKE SELECT (email, phone, subscription_status, subscription_plan, subscription_notes, landing_page_html, settings)
  ON public.venues FROM anon;

DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Insert items into recent open orders"
  ON public.order_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.status IN ('received','preparing')
        AND o.created_at > now() - interval '1 hour'
    )
  );

DROP POLICY IF EXISTS "Anyone can update open sessions at table" ON public.table_sessions;

REVOKE SELECT (secret) ON public.api_webhooks FROM anon, authenticated;

DROP POLICY IF EXISTS "Venue staff can read their own billing events" ON public.venue_billing_events;
CREATE POLICY "Venue staff can read their own billing events"
  ON public.venue_billing_events
  FOR SELECT
  TO authenticated
  USING (venue_id IS NOT NULL AND public.is_venue_staff(auth.uid(), venue_id));

REVOKE SELECT (api_key_live, api_key_test, hmac_key, client_key_live)
  ON public.venue_payment_config FROM anon, authenticated;

-- REPLAY NOTE (2026-08-14): wrapped for the same reason as the block in
-- 20260601222556 — realtime.messages is owned by supabase_realtime_admin and
-- DROP POLICY requires ownership even with IF EXISTS. On a fresh project that
-- policy was never created, so this is a no-op there.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Diners can subscribe to their own order channel" ON realtime.messages;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipping realtime.messages policy drop: not owner';
END $$;
