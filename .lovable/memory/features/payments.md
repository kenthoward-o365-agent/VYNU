---
name: Payments architecture
description: OrdrPayments uses Adyen Web Drop-in v6 for consumer checkout — Apple Pay, Google Pay, hosted card field, stored cards
type: feature
---

## Architecture
Consumer checkout uses **Adyen Web Drop-in v6** (`@adyen/adyen-web`) mounted via `src/components/consumer/AdyenDropin.tsx`. The Drop-in:
- Renders an Apple Pay button on Safari iOS/macOS when a card is in Wallet
- Renders a Google Pay button on Chrome/Android when a card is in Google Pay
- Renders a hosted (PCI SAQ A iframe) card field as fallback
- Handles 3DS2 challenge inline

The edge function `supabase/functions/adyen-payment/index.ts` proxies `/paymentMethods`, `/payments`, and `/payments/details`. The client never builds the `paymentMethod` object — it always passes through whatever Drop-in produces.

## Stored cards (signed-in diners)
Stored cards are still rendered above the Drop-in as a "Saved Cards" section. Selecting one bypasses the Drop-in and uses the legacy `stored_card_token` flow on the edge function.

## Apple Pay domain verification
Apple Pay requires `public/.well-known/apple-developer-merchantid-domain-association` to be served at `/.well-known/...` on every domain that accepts Apple Pay (including `ordrup.lovable.app` and any custom domain). The file content is downloaded from Adyen Customer Area → Settings → Apple Pay → Add Domain.

## Mock test mode
When `venue_payment_config.environment = "test"` and no `api_key_test` is set, the edge function returns mocked `paymentMethods` (card + applepay + googlepay) and simulates `Authorised` responses. This lets the UI flow be tested end-to-end without real Adyen credentials.

## Adyen client key
The Drop-in needs an Adyen client key (public, safe to ship) at runtime. It is NOT stored in `venue_payment_config` yet — the AdyenDropin component receives it as a prop. For mock mode the key is omitted and the Drop-in shows a fallback message; the legacy raw-card form still works as a backup.

## Out of scope
- PayPal, Klarna, BNPL (Drop-in supports them but not enabled)
- Live Adyen credential provisioning (admin task in Adyen Customer Area)
