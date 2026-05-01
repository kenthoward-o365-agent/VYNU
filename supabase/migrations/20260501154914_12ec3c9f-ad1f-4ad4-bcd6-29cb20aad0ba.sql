-- Phase 5: helper RPC used by the load-test report.
-- Returns the top-20 statements by total time from pg_stat_statements.
CREATE OR REPLACE FUNCTION public.loadtest_top_queries()
RETURNS TABLE (
  calls bigint,
  mean_ms double precision,
  p95_ms double precision,
  query text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    s.calls,
    s.mean_exec_time AS mean_ms,
    -- pg_stat_statements doesn't expose p95 directly; use stddev as a proxy.
    s.mean_exec_time + (1.96 * s.stddev_exec_time) AS p95_ms,
    left(s.query, 500) AS query
  FROM extensions.pg_stat_statements s
  WHERE s.query NOT ILIKE '%pg_stat_statements%'
  ORDER BY s.total_exec_time DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.loadtest_top_queries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loadtest_top_queries() TO service_role;