# Deploy the latest GitHub push (PR #15)

## What changed

PR #15 (`HLRDRNW-28-handle-schema-mismatch`, commits `9e3e674`, `d737248`, `9921b19`) touched edge function code only:

- `supabase/functions/_shared/hl-weborders-client.ts` — match the H&L `addorder` schema: item/modifier names, `device_time` format, integer `account_id`, omit `account_id` when absent, reject non-numeric reference
- `supabase/functions/_shared/pos-adapter.ts`
- `supabase/functions/pos-hl-test-order/index.ts`
- `supabase/functions/pos-outbound-worker/index.ts`

No migration files landed in these commits. The newest migration in the repo is still `20260806090000_schedule_pos_outbound_worker.sql`, which was applied in an earlier pass.

## Steps

1. Confirm the migration ledger has nothing pending (expected: none).
2. Redeploy every function that bundles the changed shared code — shared files are bundled per function, so each importer needs its own redeploy:
   - `pos-outbound-worker`
   - `pos-hl-test-order`
   - `pos-hl-order-get`
   - `pos-hl-webhook`
   - `pos-test-connection`
   - `pos-menu-pull`
   - `pos-order-push`
3. Verify:
   - Each deploy builds cleanly and `pos-test-connection` still boots (a 400/401 on an empty request is the healthy answer).
   - Check `pos-outbound-worker` logs and the `pgmq.q_jobs_pos_outbound` depth after the deploy — no schema-mismatch errors from H&L on the next pushed order.

## Notes

- Deploy-only pass over already-merged code; no source files change.
- No secrets, cron schedules, or migration content are modified.
- If a queued order fails against H&L after the deploy, I'll report the exact response rather than editing the mapping logic.
