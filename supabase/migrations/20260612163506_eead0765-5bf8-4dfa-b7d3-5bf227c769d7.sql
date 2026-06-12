
-- =====================================================================
-- Part 1A: harden ensure_monthly_partition() so new partitions are
-- created locked-down by default, with the canonical policy set.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_monthly_partition(_parent regclass, _month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _start date := date_trunc('month', _month)::date;
  _end   date := (date_trunc('month', _month) + interval '1 month')::date;
  _parent_name text := split_part(_parent::text, '.', 2);
  _name  text := COALESCE(NULLIF(_parent_name, ''), _parent::text)
                 || '_y' || to_char(_start, 'YYYY') || 'm' || to_char(_start, 'MM');
  _qual  text := format('public.%I', _name);
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    _name, _parent::text, _start, _end);

  -- Lock the partition down: no anon/public, no broad authenticated read.
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', _qual);
  EXECUTE format('REVOKE ALL ON %s FROM anon', _qual);
  EXECUTE format('GRANT SELECT ON %s TO authenticated', _qual);
  EXECUTE format('GRANT ALL ON %s TO service_role', _qual);
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', _qual);

  -- Re-apply canonical, authenticated-only policies on the partition.
  IF _parent::text IN ('api_request_log', 'public.api_request_log') THEN
    EXECUTE format('DROP POLICY IF EXISTS "Admins view request log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Admins view request log part" ON %s
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'tabless_admin'::app_role))$p$, _qual);

    EXECUTE format('DROP POLICY IF EXISTS "Service insert request log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Service insert request log part" ON %s
      FOR INSERT TO service_role
      WITH CHECK (true)$p$, _qual);

  ELSIF _parent::text IN ('pos_sync_log', 'public.pos_sync_log') THEN
    EXECUTE format('DROP POLICY IF EXISTS "Admins view sync log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Admins view sync log part" ON %s
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'tabless_admin'::app_role))$p$, _qual);

    EXECUTE format('DROP POLICY IF EXISTS "Managers view sync log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Managers view sync log part" ON %s
      FOR SELECT TO authenticated
      USING (public.is_venue_manager(auth.uid(), venue_id))$p$, _qual);

    EXECUTE format('DROP POLICY IF EXISTS "Staff view sync log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Staff view sync log part" ON %s
      FOR SELECT TO authenticated
      USING (public.is_venue_staff(auth.uid(), venue_id))$p$, _qual);

    EXECUTE format('DROP POLICY IF EXISTS "Service insert sync log part" ON %s', _qual);
    EXECUTE format($p$CREATE POLICY "Service insert sync log part" ON %s
      FOR INSERT TO service_role
      WITH CHECK (true)$p$, _qual);
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.ensure_monthly_partition(regclass, date)
IS 'Creates a monthly partition AND re-applies the canonical TO-authenticated/service_role policy set. Do not strip the GRANT/REVOKE/POLICY block — partitions silently regress otherwise. See security memory.';

-- Normalise existing partitions to match.
DO $$
DECLARE
  r RECORD;
  parent_name text;
  month_start date;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.relname IN ('api_request_log','pos_sync_log')
  LOOP
    BEGIN
      month_start := to_date(substring(r.relname FROM 'y(\d{4})m(\d{2})$'), 'YYYYMM');
      parent_name := regexp_replace(r.relname, '_y\d{4}m\d{2}$', '');
      PERFORM public.ensure_monthly_partition(
        format('public.%I', parent_name)::regclass,
        month_start
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', r.relname, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================================
-- Part 1B: remove anon read path on public.venues.
-- Unauthenticated diners must use the public RPCs:
--   lookup_venue_by_site_id(site_id) — QR landing
--   get_venue_public_info(venue_id)  — landing render
--   get_menu_snapshot(venue_id, table_id) — menu/AI config
-- =====================================================================
DROP POLICY IF EXISTS "venues_select_active_anon" ON public.venues;
REVOKE SELECT ON public.venues FROM anon;
