# Sync the last PRs into staging

## What I found

Two things from the recent PRs never made it into the running staging backend, and one of them is broken at source.

**1. One migration is still unapplied**

`20260805100000_guest_order_venue_check.sql` (PR #9, "Fix guest QR orders failing with 42501") is in the repo but is not recorded in the database, and its helper function `is_active_venue` does not exist in the database. This is exactly the blocker behind the empty Orders board during the RFP demo capture — guest QR orders still fail the orders INSERT policy.

The four older files (`20260803134535`, `20260803134536`, `20260804060000`, `20260804120000`) are missing from the migration ledger too, but I verified their objects are all present in the database (refund `request_id` column + unique index, both tab-payment authority trigger functions, the `tab_payments_diner_request` policy, service-role-only grants on `set_pos_credential` / `set_payment_secret`). They were applied out-of-band, so no action needed beyond noting the ledger drift.

**2. PR #8 merged syntactically invalid edge function code**

Commit `debf85c` / merge `74f27f4` (HLRDRNW-27, "validate H&L config and verify the orders host on test connection") shipped two files that do not parse:

- `supabase/functions/_shared/hl-weborders-client.ts` — the new `missingOrderIds()` function is missing its closing brace, so everything after it is swallowed.
- `supabase/functions/adapters/hl_exceed/index.ts` — `testConnection()` opens a `try {` with no `catch`/`finally`, and the probe/return block was left inside it.

I confirmed the breakage exists in the PR branch commit itself, not from a local merge. Every edge function importing these files (`pos-hl-test-order`, `pos-hl-webhook`, `pos-hl-order-get`, `pos-menu-pull`, `pos-outbound-worker`, `pos-test-connection`, `pos-order-push`) will fail to deploy until it is fixed. Frontend typecheck is clean.

## Plan

1. Repair `_shared/hl-weborders-client.ts`: close `missingOrderIds()` before `getHLToken`.
2. Repair `adapters/hl_exceed/index.ts` `testConnection()`: wrap only the token fetch in `try`/`catch` (returning `{ ok: false, message }` on failure), then run the `probeWebOrders` step after it, preserving the PR's intended three-step check (config ids -> credentials -> orders host).
3. Typecheck both files plus `pos-hl-test-order` to confirm they parse.
4. Apply the pending `20260805100000_guest_order_venue_check.sql` migration.
5. Redeploy the H&L-dependent edge functions: `pos-hl-test-order`, `pos-hl-webhook`, `pos-hl-order-get`, `pos-menu-pull`, `pos-outbound-worker`, `pos-test-connection`, `pos-order-push`.
6. Verify: `is_active_venue` exists and the orders INSERT policy uses it; place a guest order end-to-end on Young & Jackson table 100 and confirm it lands on the Orders board; call `pos-test-connection` for the H&L provider and confirm it returns a real config/credential/host message rather than a 500.

## Technical notes

- Fixes are limited to the two broken files plus the migration apply and deploys — no behaviour change beyond what PR #8 and #9 intended.
- Ledger drift (four applied-but-unrecorded migrations) is left as-is; re-running them would be redundant and the ledger is not consulted at runtime. Worth flagging to the dev team so future `db push` runs from CI don't try to replay them.
