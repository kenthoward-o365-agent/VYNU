# Ship the pending PR work to staging

## What I checked

Your syntax fixes are in (merge `49a485a`, PR #10) and both files now parse — frontend typecheck is clean too. What's left is purely a deploy/apply pass.

**1. One migration is genuinely unapplied**

`20260805100000_guest_order_venue_check.sql` (PR #9) is in the repo but not in the migration ledger, and its helper `is_active_venue` does not exist in the database. The live `orders` INSERT policy still uses an inline `EXISTS (SELECT 1 FROM venues ...)` subquery, which anon guests can't evaluate under RLS — that is the 42501 blocking guest QR orders and the empty Orders board in the RFP demo capture.

**2. Ledger drift on four older files (no action needed)**

`20260803134535`, `20260803134536`, `20260804060000`, `20260804120000` are missing from the ledger, but their objects are present in the database (verified previously). They were applied out-of-band. Re-running them would be redundant; the ledger isn't consulted at runtime.

**3. Edge functions from PR #8 have never been deployed**

PR #8 changed `_shared/hl-weborders-client.ts` (adds `missingOrderIds`, `probeWebOrders`), `adapters/hl_exceed/index.ts` (three-step `testConnection`), and `pos-hl-test-order`. Shared code is bundled per function, so every consumer needs a redeploy.

## Plan

1. Apply `20260805100000_guest_order_venue_check.sql` — creates `is_active_venue` and rewrites the `orders` INSERT policy to use it.
2. Redeploy the functions that bundle the changed H&L / adapter code:
   - Direct H&L: `pos-hl-test-order`, `pos-hl-webhook`, `pos-hl-order-get`
   - Via the adapter registry in `_shared/pos-adapter.ts`: `pos-test-connection`, `pos-menu-pull`, `pos-outbound-worker`
3. Verify:
   - `is_active_venue` exists and the `orders` INSERT policy references it.
   - Call `pos-test-connection` for the H&L provider and confirm it returns a real config / credential / orders-host message rather than a 500.
   - Place a guest order on Young & Jackson table 100 and confirm it lands on the Orders board.

## Technical notes

- No source files change in this plan — it is apply + deploy over already-merged work.
- The frontend halves of PR #8 (`HLPosPanel.tsx`, `PosConnectDialog.tsx`) are already in the running preview; they only need a publish to reach the published URL.
- Worth flagging the ledger drift to the dev team so a future CI `db push` doesn't try to replay the four out-of-band migrations.
