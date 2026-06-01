
-- 1) Storage: drop the 3 weak venue-assets policies
DROP POLICY IF EXISTS "Venue staff can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Venue staff can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Venue staff can delete assets" ON storage.objects;

-- Add a proper INSERT policy (stricter ones only covered UPDATE/DELETE)
CREATE POLICY "Staff can upload venue assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-assets'
  AND public.is_venue_staff(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
);

-- 2) chat_sessions: drop anon UPDATE (table is not used by app code)
DROP POLICY IF EXISTS "Anon can update chat sessions by id" ON public.chat_sessions;

-- 3) diner_web_sessions: drop anon UPDATE (client will use edge function)
DROP POLICY IF EXISTS "Anyone can update a web session by id" ON public.diner_web_sessions;

-- 4) table_sessions: fix self-referential WITH CHECK bug
DROP POLICY IF EXISTS "Anyone can update open sessions at table" ON public.table_sessions;
CREATE POLICY "Anyone can update open sessions at table"
ON public.table_sessions FOR UPDATE
USING (status = ANY (ARRAY['open','firing']))
WITH CHECK (
  status = ANY (ARRAY['open','firing','closed'])
  AND venue_id = (SELECT ts.venue_id FROM public.table_sessions ts WHERE ts.id = table_sessions.id)
  AND table_id = (SELECT ts.table_id FROM public.table_sessions ts WHERE ts.id = table_sessions.id)
);

-- 5) Enable RLS on all partition tables and mirror parent policies
DO $$
DECLARE
  p text;
  parts text[] := ARRAY[
    'api_request_log_y2026m05','api_request_log_y2026m06','api_request_log_y2026m07','api_request_log_y2026m08',
    'pos_sync_log_y2026m05','pos_sync_log_y2026m06','pos_sync_log_y2026m07','pos_sync_log_y2026m08'
  ];
BEGIN
  FOREACH p IN ARRAY parts LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p);
    IF p LIKE 'api_request_log%' THEN
      EXECUTE format($f$CREATE POLICY "Admins view request log part" ON public.%I FOR SELECT USING (has_role(auth.uid(), 'tabless_admin'::app_role))$f$, p);
      EXECUTE format($f$CREATE POLICY "Service insert request log part" ON public.%I FOR INSERT WITH CHECK (true)$f$, p);
    ELSE
      EXECUTE format($f$CREATE POLICY "Managers view sync log part" ON public.%I FOR SELECT USING (is_venue_manager(auth.uid(), venue_id))$f$, p);
      EXECUTE format($f$CREATE POLICY "Staff view sync log part" ON public.%I FOR SELECT USING (is_venue_staff(auth.uid(), venue_id))$f$, p);
      EXECUTE format($f$CREATE POLICY "Admins view sync log part" ON public.%I FOR SELECT USING (has_role(auth.uid(), 'tabless_admin'::app_role))$f$, p);
      EXECUTE format($f$CREATE POLICY "Service insert sync log part" ON public.%I FOR INSERT WITH CHECK (true)$f$, p);
    END IF;
  END LOOP;
END $$;

-- 6) venue_pos_integrations: restrict staff SELECT to managers
DROP POLICY IF EXISTS "Staff can view pos integrations" ON public.venue_pos_integrations;
CREATE POLICY "Managers can view pos integrations"
ON public.venue_pos_integrations FOR SELECT
USING (is_venue_manager(auth.uid(), venue_id));

-- 7) venues: revoke sensitive columns from anon
REVOKE SELECT ON public.venues FROM anon;
GRANT SELECT (
  id, name, venue_type, address, city, state, postcode, country,
  logo_url, operating_hours, timezone, settings, is_active,
  created_at, updated_at, group_id, landing_page_html, site_id, menu_source
) ON public.venues TO anon;

-- 8) realtime.messages: enable RLS + restrict subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to venue channels" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to venue channels"
ON realtime.messages FOR SELECT TO authenticated
USING (
  -- topic patterns like "venue:<uuid>" or "orders:<venue_uuid>" – allow if staff of that venue
  EXISTS (
    SELECT 1
    WHERE (
      (realtime.topic() ~ '^[a-zA-Z_]+:[0-9a-f-]{36}$')
      AND public.is_venue_staff(
        auth.uid(),
        (regexp_replace(realtime.topic(), '^[a-zA-Z_]+:', ''))::uuid
      )
    )
  )
);

DROP POLICY IF EXISTS "Diners can subscribe to their own order channel" ON realtime.messages;
CREATE POLICY "Diners can subscribe to their own order channel"
ON realtime.messages FOR SELECT TO authenticated, anon
USING (
  -- public topics that don't carry sensitive info; allow only specific prefixes
  realtime.topic() LIKE 'public:%'
);
