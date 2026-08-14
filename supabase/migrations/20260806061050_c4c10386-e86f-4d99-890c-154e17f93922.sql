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
    timeout_milliseconds := 60000
  );
  $$
);