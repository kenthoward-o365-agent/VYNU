-- Schedule pos-outbound-worker.
--
-- pos-order-push and the auto-push trigger (enqueue_order_push_on_insert) only
-- ever pgmq.send() a { kind: 'send_order' } job and set orders.pos_push_status
-- to 'queued'. Neither talks to the POS. The HTTP call to H&L happens solely in
-- the pos-outbound-worker edge function -- which nothing was invoking, so every
-- order sat at 'queued' forever and never reached Exceed.
--
-- The worker's header comment already claims "Run via pg_cron every 10s", but no
-- migration ever created that job. This adds it.
--
-- Both the target host and the bearer come from Vault rather than being inlined,
-- so this file is environment-agnostic: promoting it to prod needs no edit, and
-- no credential is committed. A hardcoded project ref would be worse than
-- useless here -- prod's cron would drain *staging's* queue every 10s while its
-- own orders sat untouched. Create both secrets once per environment:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET or service-role key>', 'cron_secret');
--
-- The worker authenticates on CRON_SECRET or the service-role key
-- (pos-outbound-worker/index.ts AEA-06 check). Re-run create_secret with a new
-- value to rotate; this job picks it up on the next tick.

CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

SELECT cron.unschedule('pos-outbound-worker')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pos-outbound-worker');

SELECT cron.schedule(
  'pos-outbound-worker',
  '10 seconds',
  $$
  SELECT net.http_post(
    url     := (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
    ) || '/functions/v1/pos-outbound-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'
      )
    ),
    body    := '{}'::jsonb,
    -- Below the worker's 90s visibility timeout, so a hung request cannot leave
    -- a job invisible after pg_net has already given up on it.
    timeout_milliseconds := 60000
  );
  $$
);
