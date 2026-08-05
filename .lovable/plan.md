# Redeploy check for the last two GitHub pushes

## What the pushes contain

The last two commits are PR #11 (`HLRDRNW-28`) and its merge:

- `supabase/functions/_shared/hl-weborders-client.ts` — H&L order payload fixes (integer PLU, tender code, guard for unmapped PLUs)
- `src/pages/KnowledgeBase.tsx` — frontend copy only

No new migration files were added — the newest file in `supabase/migrations` is `20260805100000_guest_order_venue_check.sql`, which was already applied.

## What needs action

Shared edge-function code is bundled per function, so every function that imports the H&L client (directly or through the adapter registry) still runs the old payload logic until it is redeployed.

1. Redeploy the H&L consumers:
   - Direct: `pos-hl-test-order`, `pos-hl-webhook`, `pos-hl-order-get`
   - Via `_shared/pos-adapter.ts` registry: `pos-test-connection`, `pos-menu-pull`, `pos-outbound-worker`
2. Verify each deploy builds cleanly and `pos-test-connection` still responds (401 unauthenticated is the expected healthy answer).
3. The KnowledgeBase copy change is frontend-only — it reaches the published site with a Publish, no deploy step.

## Technical notes

- No database work in this pass; nothing in the two pushes touches schema, policies, or grants.
- Deploys are backend-only and go live immediately; the frontend half needs Publish.
