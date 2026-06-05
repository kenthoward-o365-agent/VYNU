
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
BEGIN
  FOREACH parent IN ARRAY ARRAY['api_request_log','pos_sync_log']
  LOOP
    FOR i IN 0..months_ahead LOOP
      start_d := date_trunc('month', (now() + (i || ' month')::interval))::date;
      end_d := (start_d + interval '1 month')::date;
      suffix := to_char(start_d, '"y"YYYY"m"MM');
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        parent || '_' || suffix, parent, start_d, end_d
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_log_partitions(INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.drop_old_log_partitions(retain_months INT DEFAULT 12)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  cutoff DATE := date_trunc('month', now() - (retain_months || ' month')::interval)::date;
  part_date DATE;
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
      part_date := to_date(substring(r.relname FROM 'y(\d{4})m(\d{2})$'), 'YYYYMM');
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF part_date < cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS public.%I', r.relname);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.drop_old_log_partitions(INT) FROM PUBLIC, anon, authenticated;

-- Schedule via pg_cron
SELECT cron.unschedule('ensure-log-partitions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-log-partitions');
SELECT cron.unschedule('drop-old-log-partitions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drop-old-log-partitions');

SELECT cron.schedule(
  'ensure-log-partitions',
  '0 2 * * *',
  $$SELECT public.ensure_log_partitions(3);$$
);

SELECT cron.schedule(
  'drop-old-log-partitions',
  '0 3 1 * *',
  $$SELECT public.drop_old_log_partitions(12);$$
);

-- Run once now to top up
SELECT public.ensure_log_partitions(3);
