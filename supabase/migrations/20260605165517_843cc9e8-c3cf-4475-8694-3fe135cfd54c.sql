
-- =========================================================================
-- 1. api_webhooks.secret — service_role only
-- =========================================================================
REVOKE SELECT (secret) ON public.api_webhooks FROM authenticated, anon;

-- =========================================================================
-- 2. venue_payment_config raw credentials — service_role only
-- =========================================================================
REVOKE SELECT (api_key_live, api_key_test, hmac_key, client_key_live)
  ON public.venue_payment_config FROM authenticated, anon;

-- =========================================================================
-- 3. venue_pos_integrations credential blobs — service_role only
-- =========================================================================
REVOKE SELECT (secrets_map, webhook_secret, token_cache, client_secret_ref)
  ON public.venue_pos_integrations FROM authenticated, anon;

-- =========================================================================
-- 4. Log partition INSERT policies → service_role only
--    (re-create the per-partition "Service insert ..." policies scoped to service_role)
-- =========================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS part_name, p.relname AS parent
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.relname IN ('api_request_log','pos_sync_log')
  LOOP
    IF r.parent = 'api_request_log' THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS "Service insert request log part" ON public.%I', r.part_name
      );
      EXECUTE format(
        'CREATE POLICY "Service insert request log part" ON public.%I FOR INSERT TO service_role WITH CHECK (true)',
        r.part_name
      );
    ELSE
      EXECUTE format(
        'DROP POLICY IF EXISTS "Service insert sync log part" ON public.%I', r.part_name
      );
      EXECUTE format(
        'CREATE POLICY "Service insert sync log part" ON public.%I FOR INSERT TO service_role WITH CHECK (true)',
        r.part_name
      );
    END IF;
  END LOOP;
END $$;

-- Update the auto-partition function so future partitions inherit the service-role-only rule
CREATE OR REPLACE FUNCTION public.ensure_log_partitions(months_ahead INT DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INT;
  start_d DATE;
  end_d DATE;
  suffix TEXT;
  parent TEXT;
  part_name TEXT;
BEGIN
  FOREACH parent IN ARRAY ARRAY['api_request_log','pos_sync_log']
  LOOP
    FOR i IN 0..months_ahead LOOP
      start_d := date_trunc('month', (now() + (i || ' month')::interval))::date;
      end_d := (start_d + interval '1 month')::date;
      suffix := to_char(start_d, '"y"YYYY"m"MM');
      part_name := parent || '_' || suffix;

      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        part_name, parent, start_d, end_d
      );
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part_name);
      EXECUTE format(
        'GRANT SELECT ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role;',
        part_name, part_name
      );

      IF parent = 'api_request_log' THEN
        EXECUTE format($p$
          DROP POLICY IF EXISTS "Admins view request log part" ON public.%1$I;
          CREATE POLICY "Admins view request log part" ON public.%1$I
            FOR SELECT USING (has_role(auth.uid(), 'tabless_admin'::app_role));
          DROP POLICY IF EXISTS "Service insert request log part" ON public.%1$I;
          CREATE POLICY "Service insert request log part" ON public.%1$I
            FOR INSERT TO service_role WITH CHECK (true);
        $p$, part_name);
      ELSE
        EXECUTE format($p$
          DROP POLICY IF EXISTS "Admins view sync log part" ON public.%1$I;
          CREATE POLICY "Admins view sync log part" ON public.%1$I
            FOR SELECT USING (has_role(auth.uid(), 'tabless_admin'::app_role));
          DROP POLICY IF EXISTS "Managers view sync log part" ON public.%1$I;
          CREATE POLICY "Managers view sync log part" ON public.%1$I
            FOR SELECT USING (is_venue_manager(auth.uid(), venue_id));
          DROP POLICY IF EXISTS "Staff view sync log part" ON public.%1$I;
          CREATE POLICY "Staff view sync log part" ON public.%1$I
            FOR SELECT USING (is_venue_staff(auth.uid(), venue_id));
          DROP POLICY IF EXISTS "Service insert sync log part" ON public.%1$I;
          CREATE POLICY "Service insert sync log part" ON public.%1$I
            FOR INSERT TO service_role WITH CHECK (true);
        $p$, part_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_log_partitions(INT) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 5. chat_sessions — tighten anon read + revoke diner_id column
-- =========================================================================
REVOKE SELECT (diner_id) ON public.chat_sessions FROM anon;

DROP POLICY IF EXISTS "Anon can read open sessions" ON public.chat_sessions;
CREATE POLICY "Anon can read recent open sessions"
  ON public.chat_sessions
  FOR SELECT
  TO anon
  USING (
    ended_at IS NULL
    AND started_at > now() - interval '2 hours'
  );

-- =========================================================================
-- 6. table_sessions — drop broad anon SELECT, revoke host_diner_id
--    Consumers use list_open_sessions_at_table RPC; staff use staff policy.
-- =========================================================================
REVOKE SELECT (host_diner_id) ON public.table_sessions FROM anon;

DROP POLICY IF EXISTS "Anyone can read open sessions" ON public.table_sessions;
-- Minimal anon SELECT kept so realtime postgres_changes can deliver events
-- to the consumer; payload no longer exposes host_diner_id (revoked above).
CREATE POLICY "Anon can read recent open sessions"
  ON public.table_sessions
  FOR SELECT
  TO anon
  USING (
    status IN ('open','firing')
    AND opened_at > now() - interval '4 hours'
  );
