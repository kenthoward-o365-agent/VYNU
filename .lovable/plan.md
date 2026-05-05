# Fix: payments are silently simulating instead of charging

## Root cause

For your venue, `venue_payment_config` has `is_active=true` and `environment=test` and an `api_key_test`, but **`client_key_test` is null** and `merchant_account` isn't a valid Adyen value. The edge function (`adyen-payment/index.ts` lines 194–203) treats *any* missing piece as "not provisioned yet" and silently falls into **mock mode**, which:

- Returns mock `paymentMethods` to the client.
- Causes `OrdrPayDropin` to refuse to mount (no client key) → falls back to the legacy raw card form.
- `mockPayment()` auto-`Authorised`s anything the diner types — including no card at all in some paths — so the order flips to `paid` without contacting Adyen.

That's why "the order is just placed without payment".

## Fix — two parts

### Part A — Wire up real Adyen test mode (admin-only credentials)

Per the OrdrPay branding rule, the underlying processor must never appear in venue-facing UI. So credentials go into a **Tab-Less Admin** screen, not Settings → Payments.

1. **New super-admin section** in `src/pages/AdminVenueDetail.tsx` → "Processor credentials (internal)", visible only to `tabless_admin`. Fields:
   - `api_key_test`, `api_key_live`
   - `client_key_test`, `client_key_live`
   - `merchant_account`
   - `hmac_key` (optional, for future webhook)
   - `apple_pay_merchant_id`, `google_pay_merchant_id` (optional)
   - "Test connection" button (calls existing `action: "test_connection"`).
2. Saves go through a new edge function `admin-set-payment-credentials` (service-role, validates `has_role(auth.uid(),'tabless_admin')`) — keeps these secrets out of any RLS-readable surface.
3. Once `client_key_test` + valid `merchant_account` + `api_key_test` are present, `isMock` evaluates false, the Drop-in mounts against `https://checkout-test.adyen.com/v71`, and the `4111…` test card hits Adyen's real test authoriser.

### Part B — Make mock mode safe & obvious (so this never silently happens again)

Edits to `supabase/functions/adyen-payment/index.ts`:

1. **Reject empty / unknown card numbers in mock**. `mockPayment()` currently defaults to `Authorised` for *any* string; change it to require an exact match in `MOCK_TEST_CARDS` and return `Refused / "Unknown test card"` otherwise.
2. **Stamp the order**. When `isMock` and `create_payment` succeeds, write `payment_psp_reference = "MOCK_…"` and a new `payment_is_mock = true` boolean on `orders` (migration).
3. **Return `mock_mode: true` on every action**, not just `payment_methods`.

Edits to `src/components/consumer/CheckoutPanel.tsx`:

4. When `isMockMode === true`, replace the existing small warning with a **prominent yellow banner** above the pay button: *"Simulated payment — no card will be charged. For demo only."* Disable "Save card" and "Apple/Google Pay" buttons in mock.
5. After a mock-mode order, show "Demo order placed (no payment taken)" instead of "Payment successful 🎉".

Edits to operator views (`Orders.tsx`, `ReceiptView.tsx`):

6. Show a **"DEMO"** badge on any order with `payment_is_mock = true`, so staff don't accept food for an unpaid simulated order.

## Files

**New**
- `supabase/functions/admin-set-payment-credentials/index.ts`
- `supabase/migrations/<ts>_orders_payment_is_mock.sql` — `alter table orders add column payment_is_mock boolean not null default false`

**Modified**
- `src/pages/AdminVenueDetail.tsx` — admin-only credentials section
- `supabase/functions/adyen-payment/index.ts` — strict mock matching, mock flag in every response, set `payment_is_mock` on order
- `src/components/consumer/CheckoutPanel.tsx` — prominent simulated-payment banner, disable wallet/save in mock, different success toast
- `src/components/orders/*` and `src/components/consumer/ReceiptView.tsx` — DEMO badge

## What you'll do after the build

1. In Adyen Customer Area → Developers → API credentials, copy the **test API key** and **test client key**, and the **merchant account name**.
2. Open Tab-Less Admin → your venue → Processor credentials, paste them in, click *Test connection*.
3. Re-open the diner checkout — you'll see the real Adyen Drop-in (Apple Pay/Google Pay buttons + hosted card field). Test card `4111 1111 1111 1111` will go through Adyen's test authoriser, and a refusal card (`4000 0000 0000 0002`) will actually be refused.
