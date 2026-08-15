-- Seed the monthly log partitions that later migrations assume already exist.
--
-- WHY THIS EXISTS
-- api_request_log and pos_sync_log are PARTITION BY RANGE (created_at). Their
-- monthly partitions are created at RUNTIME by ensure_monthly_partition /
-- ensure_log_partitions — never by a migration. In the original database those
-- partitions existed because the app had been running since May 2026, so eight
-- later migrations reference them by name (ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY, CREATE POLICY, ALTER POLICY, REVOKE) and worked fine.
--
-- Replayed against a fresh database, none of them exist and the first such
-- migration (20260601222556) fails with 42P01 "relation ... does not exist".
--
-- Creating them here restores the state those migrations were written against,
-- which keeps all 223 original migration files untouched. The alternative —
-- editing eight historical migrations to guard every reference — rewrites
-- history to work around a missing precondition rather than supplying it.
--
-- Range: 2026-05 .. 2026-09, the months the later migrations name.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, and ensure_monthly_partition uses
-- the same guard, so runtime partition creation still works afterwards. RLS and
-- policies are deliberately NOT set here — 20260601222556 does that next, which
-- is the whole point of making these tables exist first.

DO $$
DECLARE
  parent   text;
  month    date;
  part     text;
BEGIN
  FOREACH parent IN ARRAY ARRAY['api_request_log', 'pos_sync_log'] LOOP
    -- Skip unless the parent exists AND is actually partitioned (relkind 'p').
    -- Guards against ordering surprises if these tables are ever restructured.
    IF to_regclass(format('public.%I', parent)) IS NULL
       OR (SELECT c.relkind
             FROM pg_class c
            WHERE c.oid = to_regclass(format('public.%I', parent))) <> 'p'
    THEN
      RAISE NOTICE 'skipping %: not a partitioned table', parent;
      CONTINUE;
    END IF;

    FOR month IN
      SELECT generate_series('2026-05-01'::date, '2026-09-01'::date, interval '1 month')::date
    LOOP
      part := format('%s_y%sm%s', parent, to_char(month, 'YYYY'), to_char(month, 'MM'));

      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        part,
        parent,
        month,
        (month + interval '1 month')::date
      );
    END LOOP;
  END LOOP;
END $$;
