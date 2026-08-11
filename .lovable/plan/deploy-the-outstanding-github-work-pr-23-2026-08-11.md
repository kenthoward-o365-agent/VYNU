# Deploy the outstanding GitHub work (PR #23)

Going back to the last deploy pass (`b5e9a0e6`, the rate-limit/idempotency migration applied as-is), the only backend change pushed since then is PR #23 (`HLRDRNW-24-failed-payment`).

## What is outstanding

- `supabase/functions/adyen-payment/index.ts` — three commits: fix guest card payments so failed payments are no longer reported as successful, forward `paymentData` for 3DS, and mark stored-card payments as shopper-initiated.
- No new migration files landed in that range. Every migration file in the repo through `20260810120000_fix_payment_config_dead_plaintext_columns.sql` was applied in earlier passes, plus `20260723100000_hlrdrnw66_rate_limit_and_idempotency.sql` last turn.
- Frontend changes in the same PR (`CheckoutPanel.tsx`, `TabBillPanel.tsx`, `payment-result.ts` and its tests) go live with the next publish — nothing to deploy here.

## Steps

1. Redeploy `adyen-payment`.
2. Verify the deploy builds cleanly and the function boots (a 400/401 on an empty request is the healthy answer).
3. Check the function logs for boot errors after the deploy.

## Notes

- Deploy-only pass over already-merged code; no source files change.
- No secrets are regenerated and no cron schedules are touched.
- `adyen-payment` bundles `_shared/rate-limit.ts` and `_shared/safe-error.ts`, but neither changed in this range, so no other function needs a redeploy.
