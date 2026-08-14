
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

      IF parent = 'api_request_log' THEN
        EXECUTE format(
          'GRANT SELECT ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role;',
          part_name, part_name
        );
        EXECUTE format($p$
          DROP POLICY IF EXISTS "Admins view request log part" ON public.%1$I;
          CREATE POLICY "Admins view request log part" ON public.%1$I
            FOR SELECT USING (has_role(auth.uid(), 'tabless_admin'::app_role));
          DROP POLICY IF EXISTS "Service insert request log part" ON public.%1$I;
          CREATE POLICY "Service insert request log part" ON public.%1$I
            FOR INSERT WITH CHECK (true);
        $p$, part_name);
      ELSE
        EXECUTE format(
          'GRANT SELECT ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role;',
          part_name, part_name
        );
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
            FOR INSERT WITH CHECK (true);
        $p$, part_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_log_partitions(INT) FROM PUBLIC, anon, authenticated;

-- Backfill any partitions missing RLS / policies (esp. the just-created m09)
SELECT public.ensure_log_partitions(3);
