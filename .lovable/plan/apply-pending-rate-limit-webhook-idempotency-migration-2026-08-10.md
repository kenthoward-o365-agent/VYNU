# Apply pending rate-limit & webhook-idempotency migration

Apply `supabase/migrations/20260723100000_hlrdrnw66_rate_limit_and_idempotency.sql` to the database exactly as written in the repo (byte-for-byte, no rewrites).

## What it adds

- **Rate limit counters table** — stores per-bucket request counts in fixed time windows, locked down so only backend functions can touch it.
- **`check_rate_limit`** — atomic counter used by edge functions (SMS sending, POS webhooks) so limits work across all serverless instances instead of per-instance memory.
- **Processed webhook events table** — records which webhook events have already been handled.
- **`claim_webhook_event` / `release_webhook_event`** — one-shot claim so a replayed webhook is skipped, with a release path when downstream work fails so legitimate retries still process.

All four are backend-only: no guest or logged-in user access; only the server role can execute them.

## Notes

- The migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`), so applying it is safe.
- Existing shared helpers (`_shared/rate-limit.ts`) already call `check_rate_limit`; no code changes needed. No edge-function redeploy required.
- After applying, verify the two functions and two tables exist with grants limited to the service role.
