# Schedule pos-outbound-worker and redeploy cron-authenticated functions

Orders enqueued by `pos-order-push` and the auto-push trigger stay in `jobs_pos_outbound` because nothing invokes the worker that drains it. The pushed migration adds a pg_cron job that calls the worker every 10 seconds, using the project URL and cron secret stored in Vault.

## Steps

1. **Apply the pending migration** `20260806090000_schedule_pos_outbound_worker.sql` exactly as pushed — no edits. It enables `pg_cron`/`pg_net`, unschedules any existing `pos-outbound-worker` job, and schedules it at a 10-second interval with the Vault-sourced URL and bearer token.
2. **Redeploy `pos-outbound-worker`** so it picks up the new `CRON_SECRET` edge function secret.
3. **Redeploy for consistency**: `session-tick`, `throttle-tick`, `process-job-queue`, `partner-webhook-dispatch`, `pci-page-integrity-check`, `ar-generate-invoices`, `ar-charge-due-invoices`.
4. **Verify** by running the three checks you supplied: the job row (`active = true`, `10 seconds`), the last five `cron.job_run_details` rows (expect `succeeded`), and `count(*)` on `pgmq.q_jobs_pos_outbound` sampled twice a short interval apart to show it trending down.

## Notes

- No secrets will be created, rotated, or regenerated. `CRON_SECRET`, and Vault's `cron_secret` / `project_url`, are left untouched.
- No application logic or migration content changes — scheduling and redeploys only.
- Sandbox `psql` has no access to the `cron`, `vault`, or `pgmq` schemas, so verification queries will run through the privileged database read tool instead.
- If the first cron runs report `failed`, the likely cause is a missing or mismatched Vault entry; I will report the exact error rather than changing any secret.
