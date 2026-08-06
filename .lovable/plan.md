# Deploy the latest GitHub changes (PR #14)

## What's new since the last deploy pass

PR #14 (`HLRDRNW-28-handle-unmapped-items`, commits `e287c0b` + `e537d5d`) changed edge function code only:

- `supabase/functions/_shared/hl-weborders-client.ts` — send unmapped PLUs as `0` with a flag instead of throwing
- `supabase/functions/_shared/pos-adapter.ts`
- `supabase/functions/_shared/pos-context.ts`
- `supabase/functions/adapters/hl_exceed/index.ts` — keep order errors off the circuit breaker
- `supabase/functions/pos-hl-test-order/index.ts`
- `supabase/functions/pos-outbound-worker/index.ts`
- `src/components/venue/IntegrationsSettingsTab.tsx` (frontend only)

No new migration files landed in these commits. The newest migration in the repo is `20260806090000_schedule_pos_outbound_worker.sql`, which was applied last turn.

This is exactly the fix for the queue stall reported earlier: the 5 `send_order` messages sitting in `pgmq.q_jobs_pos_outbound` were failing with `sale_items[0].plu is not a usable PLU (got "")`. With this code deployed, those orders send with PLU `0` and a flag rather than erroring and retrying to DLQ.

## Steps

1. **Confirm no pending migrations** against the live ledger before deploying (expect none).
2. **Redeploy the functions that bundle the changed shared code** — shared files are bundled per function, so every importer needs a redeploy:
   - `pos-outbound-worker`
   - `pos-hl-test-order`
   - `pos-hl-order-get`
   - `pos-hl-webhook`
   - `pos-test-connection`
   - `pos-menu-pull`
   - `pos-order-push`
3. **Verify**:
   - Each deploy builds cleanly and `pos-test-connection` still boots (401 unauthenticated is the healthy answer).
   - Sample `pgmq.q_jobs_pos_outbound` twice a short interval apart and check `pos-outbound-worker` logs — the previously stuck `send_order` messages should now drain instead of erroring on the empty PLU.

## Notes

- No source files change; this is a deploy-only pass over already-merged code.
- The `IntegrationsSettingsTab.tsx` change is frontend — it reaches the published site with a Publish, no deploy step.
- No secrets, cron schedules, or migration content are modified.
- If the queued messages have already exhausted their retries into the DLQ, draining them is a separate data step — I'll report that rather than silently requeue.
