---
name: Payments architecture (ShyndigPay)
description: ShyndigPay is the in-house, white-labelled PayFac product — Apple Pay, Google Pay, hosted card field, stored cards, full merchant lifecycle
type: feature
---

## Branding rule (HARD)
The user-facing payments product is **ShyndigPay**. ShyndigPay is an in-house Payment Facilitator (PayFac) that owns the full merchant lifecycle: application, underwriting, merchant account setup, funding, fee collection, chargeback management, and statements. The internal Valpay platform powers it.

**Never name the underlying processor (Adyen, Valpay, etc.) in any user-visible surface** — UI labels, button text, error messages, toasts, Knowledge Base articles, or future plans. The processor is an internal implementation detail.

Internal infra names (`adyen-payment` edge function, `AdyenDropin.tsx` filename, `provider: "adyen"` legacy DB rows, library imports from `@adyen/adyen-web`) stay as-is — renaming them is risky and out of scope. Only the **export** of the Drop-in component is renamed to `ShyndigPayDropin`.

## Architecture
Consumer checkout uses the underlying Web Drop-in v6 (`@adyen/adyen-web`) mounted via `src/components/consumer/AdyenDropin.tsx` and exported as `ShyndigPayDropin`. The Drop-in:
- Renders an Apple Pay button on Safari iOS/macOS when a card is in Wallet
- Renders a Google Pay button on Chrome/Android when a card is in Google Pay
- Renders a hosted (PCI SAQ A iframe) card field as fallback
- Handles 3DS2 challenge inline

The edge function `supabase/functions/adyen-payment/index.ts` proxies `/paymentMethods`, `/payments`, and `/payments/details`. The client never builds the `paymentMethod` object — it always passes through whatever Drop-in produces. The edge function honours `venue_payment_config.capture_mode` (immediate vs manual).

## Per-venue config (`venue_payment_config`)
Manager-editable (shown in Settings → Payments):
- `environment` (test/live), `is_active`
- `capture_mode` (immediate/manual)
- `statement_descriptor` (max 22 chars)
- `country_code`, `default_currency`

Read-only / system-managed (shown but not editable):
- `merchant_status` (pending / under_review / approved / suspended) — set by ShyndigPay underwriting
- `merchant_id_ordrpay` — issued on approval

Internal / hidden from UI (auto-provisioned by ShyndigPay onboarding):
- `api_key_test`, `api_key_live`, `merchant_account`
- `client_key_test`, `client_key_live` — returned to the browser via `payment_methods` action
- `hmac_key` — webhook signature verification
- `apple_pay_merchant_id`, `google_pay_merchant_id`

## Stored cards (signed-in diners)
Stored cards still render above the Drop-in as a "Saved Cards" section. Selecting one bypasses the Drop-in and uses the legacy `stored_card_token` flow on the edge function.

## Apple Pay domain verification
Handled by ShyndigPay automatically — `public/.well-known/apple-developer-merchantid-domain-association` is provisioned per ShyndigPay merchant. Never instruct the venue to download or upload anything.

## Mock test mode
The edge function returns mocked `paymentMethods` (card + applepay + googlepay) and simulates `Authorised` responses when `environment = "test"` **and any** of the following hold:

- `api_key_test` is not set
- `client_key_test` is not set
- `merchant_account` is missing or malformed (contains `@`, or shorter than 3 chars)
- `merchant_status = 'pending'`

The `merchant_status` clause is the one that catches people out: a venue with valid test credentials still runs mocked until it is moved off `pending`. Mock mode renders **no** Drop-in — the diner taps Pay and the backend authorises on its mock flag alone, collecting no card data. Branding in mock messages: "ShyndigPay test mode active".

## Client key
The Drop-in's client key is returned by the edge function in the `payment_methods` response (`client_key` field, selected by environment). The browser no longer reads it from an env var. The `payment_methods` response also carries `environment` and `wallets` so the Drop-in initialises in the same environment the server processes against, with the venue's real Apple/Google Pay merchant ids.

## No raw card form (PCI SAQ A — HARD)
There is **no custom card form anywhere in the diner payment path, and none may be added.** Card entry is exclusively the hosted Drop-in iframe or a wallet; the browser only ever handles the tokenised `paymentMethod` the Drop-in produces.

- `adyen-payment` rejects any `create_payment` request carrying a `card` field with `400 Raw card data is not accepted`.
- When the Drop-in cannot load on a real (non-mock) venue, the UI shows an "unavailable" message and blocks payment. It never degrades to collecting a PAN. Missing client key in `live` is a hard fail.
- Venue billing (accounts receivable) is a separate path and uses Stripe hosted Checkout — also SAQ A.

## Out of scope
- Real ShyndigPay onboarding/KYC flow (Settings → Payments has a placeholder "Start onboarding" button that toasts "coming soon")
- Webhook handler edge function (HMAC-verified order sync)
- PayFac dashboards: statements, chargebacks, funding ledger
- PayPal, Klarna, BNPL
