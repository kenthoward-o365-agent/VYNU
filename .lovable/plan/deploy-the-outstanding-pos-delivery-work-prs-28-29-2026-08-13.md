# Deploy the outstanding POS delivery work (PRs #28/#29)

Since the last deploy pass (`31dba76d`, payment & status functions), the only backend changes pushed are the HLRDRNW-29 reliable-order-delivery work. Nothing from it is live.

## What is outstanding (verified against the live database)

- Migration `20260812120000_hlrdrnw29_pos_delivery_resilience.sql` — never applied. Confirmed in the database: `pos_outbound_job_state` and `pos_outbound_dlq` do not exist, none of the six new functions (`set_job_vt`, `bump_pos_job_attempt`, `clear_pos_job_state`, `claim_order_for_pos_push`, `pos_dlq_requeue`, `pos_dlq_resolve`) exist, and the `pos-outbound-job-state-cleanup` cron job is not scheduled.
- Edge functions changed in the same range: `pos-outbound-worker` (rewritten retry/backoff loop), `pos-order-push`, and the shared modules `_shared/hl-weborders-client.ts` and `_shared/pos-context.ts`, which are bundled into several other POS functions.

## Order of deployment

The worker calls the new database functions, so the migration must land first — deploying the functions first would leave the worker calling objects that do not exist.

1. Apply `20260812120000_hlrdrnw29_pos_delivery_resilience.sql` exactly as written in the repo.
2. Redeploy `pos-outbound-worker` and `pos-order-push` (the direct code changes).
3. Redeploy the functions that bundle the changed shared modules: `pos-menu-pull`, `pos-test-connection`, `pos-hl-order-get`, `pos-hl-test-order`, `pos-hl-webhook`.

## Verification

- Confirm both new tables, all six functions, and the cleanup cron job exist after the migration.
- Confirm each function deploys cleanly and boots (a 400/401 on an empty request is the healthy answer).
- Check `pos-outbound-worker` logs for boot errors and confirm the POS outbound queue is draining.

## Notes

- Apply-and-deploy pass over already-merged work; no source files change.
- No secrets are regenerated. The migration reschedules only the `pos-outbound-job-state-cleanup` cron job; the existing 10-second worker schedule is untouched.
- Frontend changes in the same range (POS delivery queue panel, admin scoping, edge-function error surfacing) go live with your next publish.
