# Deploy the outstanding backend work (PRs #24-#26)

Going back to the last deploy pass (PR #23, `adyen-payment` failed-payment fix), the only backend changes pushed since are from PR #26 (`HLRDRNW-19-order-confirmation`). PRs #24 and #25 touched frontend only.

## What is outstanding

- **Migration** `20260811000000_hlrdrnw19_diner_payment_status.sql` — never applied. It rewrites `get_diner_order_status` so the diner confirmation screen also receives `payment_status` (plus service mode and pickup location), and grants execute to guests.
- **Edge function** `adyen-payment` — one commit: on a successful authorisation the server now stamps the order as paid itself (the browser's own write was blocked, so paid orders never showed a receipt), and logs loudly if the stamp fails instead of telling the diner the payment failed.

## Steps

1. Apply `20260811000000_hlrdrnw19_diner_payment_status.sql` exactly as written in the repo.
2. Redeploy `adyen-payment`.
3. Verify: the function exists with the new columns in its return type and execute granted to guests; the deploy builds cleanly and the function boots.

## Notes

- Apply-and-deploy pass over already-merged work; no source files change.
- No secrets are regenerated and no cron schedules are touched.
- Frontend changes in the same range (order confirmation UI, group menu by category, staff form validation) go live with the next publish.
