
## Problem analysis

Two separate bugs are biting at once on the diner web app:

### 1. Order status not updating after order is placed
`ConsumerOrder.tsx` subscribes to `postgres_changes` on `orders` filtered by `id`. Realtime only delivers a row to a client that can `SELECT` that row under RLS. The current `orders_select_consolidated` policy requires one of:

- venue staff, OR
- `customer_id = auth.uid()`, OR
- `customer_id = get_user_diner_profile_id()`, OR
- `tabless_admin`.

Looking at recent orders in the DB, several have `customer_id = NULL` (guest diners). For those — and for any diner not signed in — the realtime channel **silently delivers nothing**, so the progress bar is frozen at "received" forever. Refreshing the page also won't recover it because `fetchOpenOrder` filters by `customer_id` too.

There is no polling fallback, so a single missed websocket frame (very common on mobile Safari going to background) also breaks status forever even for signed-in diners.

### 2. Test payments stopped working
The only configured venue (`2ff58b13-…`) has:
- `provider = ordrpayments`, `is_active = true`, `environment = test`
- `api_key_test` present, **`client_key_test` NULL**
- `merchant_account = "kent6119@gmail.com"` (contains `@` → `merchantAccountLooksValid` = false)
- `merchant_status = pending`

That triggers the mock branch in `adyen-payment/index.ts`. The `payment_methods` action returns `client_key: null`. In `CheckoutPanel.tsx`:

```ts
const showDropin = paymentEnabled && !selectedStoredCard && !!paymentMethodsResponse && !!ordrPayClientKey;
```

`ordrPayClientKey` is null, so the Drop-in is hidden. The intended legacy fallback form should appear — and it does — but the legacy form's `processLegacyPayment` only fires when the user clicks the Pay button. On the latest preview the diner taps the Drop-in slot (now blank or "Payments are in test mode" message), nothing submits, and no order row is ever created.

There is also a smaller bug: `mockPayment` runs only when there's no real key, but mock returns the literal string `"Authorised"` and `finalizePaidOrder` is called — so when the legacy path *is* used, the order does get paid. The user-reported failure is the Drop-in path going dead because `clientKey` is null.

---

## Fix plan

### A. Payments

1. **Make mock mode work in the Drop-in path too.**
   - In `supabase/functions/adyen-payment/index.ts`, when `isMock` is true, return a stable public Adyen test client key (Adyen ships a public test key for tokenisation in sandbox; we can keep a constant for the mock path) so the Drop-in mounts, OR
   - Cleaner: bypass the Drop-in entirely when `isMock = true`. The Checkout panel should detect mock mode (already known from `payment_methods` response) and render the legacy test-card form, with mock test cards (`4111…`) pre-filled in helper text. This avoids requiring any Adyen client key in mock mode and matches the OrdrPay test-mode banner copy already in the function.

2. **Fix the showDropin gate so we always show *something* payable when payments are enabled.** Current logic can leave the panel with no actionable input if `paymentMethodsResponse` arrives but `clientKey` is null. Change to: `showDropin = paymentEnabled && !selectedStoredCard && !!paymentMethodsResponse && !!ordrPayClientKey && !isMockMode`, and ensure the legacy form (or stored card list) is always available otherwise.

3. **Surface mock mode clearly in the UI** — small badge "Test mode — use card 4111 1111 1111 1111" so QA isn't confused and so we can tell at a glance during testing.

### B. Order status updates for the diner

1. **Allow guest diners to read their own just-placed order by id.** Add an RLS-safe RPC `get_diner_order_status(_order_id uuid)` (SECURITY DEFINER, returns only `id, status, total, created_at, extra_wait_minutes, throttled_until`) — no PII, no items, no customer_id. The function takes the order id only; knowing the UUID is the entitlement (same pattern QR codes already rely on).

2. **Always set `customer_id` when a diner is signed in.** `createOrderRow` already does this — verify there's no race where `authUserId` is null on first call and remove the guest fallback that drops the column when we have a `dinerId` (we can store the diner profile id as the secondary identifier, but RLS already supports that branch).

3. **Add a polling fallback to the order status subscription** in `ConsumerOrder.tsx`:
   - Keep the realtime subscription.
   - In parallel, poll `get_diner_order_status` every 5s for the active order, with exponential backoff to 15s after 2 minutes. Stop when status is terminal (`paid`, `cancelled`, `refunded`).
   - On any polled change, update `setActiveOrder` (idempotent — same shape as the realtime payload).

4. **Open-order recovery on reload for guests.** Persist `lastOrderId` in `localStorage` keyed by `venueId+tableId`; on mount, if present and not terminal, hydrate `activeOrder` via the new RPC and start the subscription + poll. Clear on terminal status.

### C. Tests

1. **Edge-function test** (`supabase/functions/adyen-payment/index_test.ts`): add cases for
   - `payment_methods` in mock mode returns `paymentMethods` AND a usable signal that client should fall back to legacy form,
   - `create_payment` in mock mode with a test card returns `Authorised` and never calls Adyen,
   - `create_payment` in mock mode with a refused card returns `Refused`.

2. **DB test** (`src/test/order-status-rpc.test.ts`): call `get_diner_order_status` with a known order id as anon key; assert it returns only the safe fields and works regardless of `customer_id`.

3. **Vitest UI test** (`src/test/consumer-order-status.test.tsx`): mock supabase client, simulate a missed realtime event, assert the polling fallback updates the status within 6s.

4. **Playwright smoke** (`e2e/diner-checkout.spec.ts`): full flow on a seeded test venue — open menu QR → add item → checkout → mock-pay → status moves `received → preparing → ready` via operator updating in a second context. This is the regression test that would have caught both bugs.

---

## Technical details

```text
Files to change
├── supabase/functions/adyen-payment/index.ts        (mock-mode flag in payment_methods response)
├── supabase/functions/adyen-payment/index_test.ts   (new)
├── supabase/migrations/<ts>_diner_order_status_rpc.sql  (new — RPC + grants to anon)
├── src/components/consumer/CheckoutPanel.tsx        (showDropin gate, mock badge, force legacy in mock)
├── src/components/consumer/AdyenDropin.tsx          (no change unless we render a clearer empty state)
├── src/pages/ConsumerOrder.tsx                      (polling fallback, RPC hydration, localStorage recovery)
├── src/test/order-status-rpc.test.ts                (new)
├── src/test/consumer-order-status.test.tsx          (new)
└── e2e/diner-checkout.spec.ts                       (new — Playwright)
```

```sql
-- new RPC, returns only diner-safe fields
CREATE OR REPLACE FUNCTION public.get_diner_order_status(_order_id uuid)
RETURNS TABLE (
  id uuid, status text, total numeric,
  created_at timestamptz, extra_wait_minutes int, throttled_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, status::text, total, created_at, extra_wait_minutes, throttled_until
  FROM public.orders WHERE id = _order_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_diner_order_status(uuid) TO anon, authenticated;
```

Polling logic (sketch in `ConsumerOrder.tsx`):

```ts
useEffect(() => {
  if (!activeOrder) return;
  const TERMINAL = new Set(["paid","cancelled","refunded"]);
  let cancelled = false;
  let attempt = 0;
  const tick = async () => {
    if (cancelled || TERMINAL.has(activeOrder.status)) return;
    const { data } = await supabase.rpc("get_diner_order_status", { _order_id: activeOrder.id });
    if (data?.[0]) setActiveOrder((p) => p ? { ...p, ...data[0] } : null);
    attempt++;
    setTimeout(tick, attempt < 24 ? 5000 : 15000);
  };
  const t = setTimeout(tick, 5000);
  return () => { cancelled = true; clearTimeout(t); };
}, [activeOrder?.id, activeOrder?.status]);
```

---

## Out of scope

- Real OrdrPay onboarding (Settings → Payments still says "coming soon").
- Webhook handler — final source of truth for live mode is still the Adyen webhook; this plan covers the in-app realtime + polling layer only.
- Migrating to AWS — separate handoff brief already produced.

---

## Acceptance criteria

1. On the current preview (mock mode, no client key, pending merchant), a guest diner can place an order, see it move from received → preparing → ready → paid with no manual refresh, on both Chrome desktop and mobile Safari.
2. With realtime websocket forcibly killed in DevTools after order placement, the diner still sees the status update within 10 seconds.
3. Test card `4111 1111 1111 1111` succeeds; `4000 0000 0000 0002` is refused (mock).
4. All new vitest, Deno, and Playwright suites green.
