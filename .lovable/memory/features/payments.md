---
name: Payments architecture (OrdrPay)
description: OrdrPay is the in-house, white-labelled PayFac product — Apple Pay, Google Pay, hosted card field, stored cards, full merchant lifecycle
type: feature
---

## Branding rule (HARD)
The user-facing payments product is **OrdrPay**. OrdrPay is an in-house Payment Facilitator (PayFac) that owns the full merchant lifecycle: application, underwriting, merchant account setup, funding, fee collection, chargeback management, and statements. The internal Valpay platform powers it.

**Never name the underlying processor (Adyen, Valpay, etc.) in any user-visible surface** — UI labels, button text, error messages, toasts, Knowledge Base articles, or future plans. The processor is an internal implementation detail.

Internal infra names (`adyen-payment` edge function, `AdyenDropin.tsx` filename, `provider: "adyen"` legacy DB rows, library imports from `@adyen/adyen-web`) stay as-is — renaming them is risky and out of scope. Only the **export** of the Drop-in component is renamed to `OrdrPayDropin`.

## Architecture
Consumer checkout uses the underlying Web Drop-in v6 (`@adyen/adyen-web`) mounted via `src/components/consumer/AdyenDropin.tsx` and exported as `OrdrPayDropin`. The Drop-in:
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
- `merchant_status` (pending / under_review / approved / suspended) — set by OrdrPay underwriting
- `merchant_id_ordrpay` — issued on approval

Internal / hidden from UI (auto-provisioned by OrdrPay onboarding):
- `api_key_test`, `api_key_live`, `merchant_account`
- `client_key_test`, `client_key_live` — returned to the browser via `payment_methods` action
- `hmac_key` — webhook signature verification
- `apple_pay_merchant_id`, `google_pay_merchant_id`

## Stored cards (signed-in diners)
Stored cards still render above the Drop-in as a "Saved Cards" section. Selecting one bypasses the Drop-in and uses the legacy `stored_card_token` flow on the edge function.

## Apple Pay domain verification
Handled by OrdrPay automatically — `public/.well-known/apple-developer-merchantid-domain-association` is provisioned per OrdrPay merchant. Never instruct the venue to download or upload anything.

## Mock test mode
When `environment = "test"` and no `api_key_test` is set, the edge function returns mocked `paymentMethods` (card + applepay + googlepay) and simulates `Authorised` responses. Branding in mock messages: "OrdrPay test mode active".

## Client key
The Drop-in's client key is returned by the edge function in the `payment_methods` response (`client_key` field, selected by environment). The browser no longer reads it from an env var. In mock mode without a configured client key the Drop-in shows a fallback message and the legacy raw-card form takes over.

## Out of scope
- Real OrdrPay onboarding/KYC flow (Settings → Payments has a placeholder "Start onboarding" button that toasts "coming soon")
- Webhook handler edge function (HMAC-verified order sync)
- PayFac dashboards: statements, chargebacks, funding ledger
- PayPal, Klarna, BNPL
