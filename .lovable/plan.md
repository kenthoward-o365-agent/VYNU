# Redeploy functions affected by PR #19

PR #19 (HLRDRNW-28: store H&L's returned order id and log push request/response) changed two shared files only:

- `supabase/functions/_shared/hl-weborders-client.ts`
- `supabase/functions/adapters/hl_exceed/index.ts`

No SQL files changed, so no migrations are pending (latest applied file is still `20260806090000_schedule_pos_outbound_worker.sql`).

## What to deploy

Every function that bundles the changed shared/adapter code must be redeployed:

1. `pos-outbound-worker`
2. `pos-hl-test-order`
3. `pos-hl-order-get`
4. `pos-hl-webhook`
5. `pos-test-connection`
6. `pos-menu-pull`

## Verification after deploy

- Confirm each deploy built cleanly.
- Smoke-check `pos-test-connection` boots (expect a `400 venue_id required` validation response).
- Check `pos-outbound-worker` logs for clean 10s cron boots with no errors.
- Confirm `pgmq.q_jobs_pos_outbound` depth is 0 so the next pushed order runs through the new logging/order-id capture path.

No application logic, secrets, or migration files will be changed.
