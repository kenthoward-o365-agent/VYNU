

## Goal

Enable **Apple Pay** and **Google Pay** (which surface Apple Wallet / Google Wallet stored cards and bank-linked cards on the device) in the OrdrPayments checkout — for both signed-in diners *and* anonymous guests. This is the table-stakes "tap to pay" experience expected from modern QR-ordering.

## Why Adyen Web Drop-in (not raw fields)

Today `CheckoutPanel.tsx` collects raw card number / expiry / CVC into React state and posts them through our edge function. That approach:

- Cannot render Apple Pay / Google Pay sheets (those are browser/OS APIs, not form fields)
- Pushes us toward PCI-DSS SAQ D (highest scope) the moment we go live
- Cannot do 3DS2 challenge UI properly

The right move is to switch the consumer checkout to **Adyen Web Drop-in v6** (`@adyen/adyen-web`), which:

- Renders Apple Pay button when Safari + a card is in Wallet
- Renders Google Pay button when Chrome + a card is in Google Wallet/Pay
- Renders a hosted card field (PCI SAQ A) for cards not in a wallet
- Handles 3DS2 challenge inline
- Works for guests (no diner account required) — wallet payments are tokenised by Apple/Google, not us
- Still supports our existing "saved cards" flow for signed-in diners

## Architecture

```text
CheckoutPanel.tsx
  │
  ├── 1. POST /functions/v1/adyen-payment {action:"payment_methods", amount, currency}
  │       ─ returns the venue's enabled methods (card, applepay, googlepay, ...)
  │
  ├── 2. Mount <AdyenCheckout> Drop-in with that response
  │       ─ Drop-in shows Apple Pay / Google Pay buttons natively
  │       ─ Card form is iframe'd by Adyen (PCI SAQ A)
  │
  ├── 3. onSubmit(state) → POST {action:"create_payment", paymentMethod: state.data.paymentMethod, browserInfo, ...}
  │       ─ edge function forwards to Adyen /payments
  │
  ├── 4. onAdditionalDetails (3DS) → POST {action:"payment_details", details}
  │
  └── 5. On Authorised → mark order paid, fire onOrderPlaced
```

The edge function changes are small — it already proxies `/payments` and `/payments/details`. We just stop building the `paymentMethod` server-side and instead pass through whatever Drop-in produced (which is a signed token for wallets, encrypted card data for manual entry).

## Apple Pay / Google Pay specifics

**Apple Pay** requires:
- Domain verification: download `apple-developer-merchantid-domain-association` from Adyen Customer Area, host it at `/.well-known/apple-developer-merchantid-domain-association` on `ordrup.lovable.app` (and any custom domain). Add as a static file in `public/.well-known/`.
- HTTPS (already covered)
- Safari on iOS/macOS with a card in Wallet
- Adyen merchant account configured for Apple Pay (admin step in Adyen CA, no code)

**Google Pay** requires:
- Chrome / Android with cards in Google Pay
- Adyen merchant account configured for Google Pay (admin step, no code)
- `gatewayMerchantId` is supplied by Drop-in automatically from the `/paymentMethods` response

Both work for **guest checkout** out of the box — the Wallet returns a one-shot tokenised payment credential, no diner profile needed.

## Files to change

- `package.json` — add `@adyen/adyen-web` (v6.x)
- `src/components/consumer/CheckoutPanel.tsx` — replace manual card form with Drop-in mount; keep stored-card flow as a "Saved cards" section above Drop-in for signed-in diners; keep gratuity + tax UI unchanged
- `src/components/consumer/AdyenDropin.tsx` (new) — small wrapper that mounts Drop-in and exposes `onPaymentCompleted` / `onError`
- `supabase/functions/adyen-payment/index.ts`:
  - `payment_methods` action: include `channel: "Web"`, return full Adyen response untouched (Drop-in needs the raw shape)
  - `create_payment` action: accept a generic `payment_method` object from the client and forward it as `paymentRequest.paymentMethod`; add `browserInfo`, `origin`, `shopperIP` from headers; keep stored-card branch
  - `payment_details` action: already correct
  - Mock mode: add a `mockPaymentMethods` response that includes `applepay` / `googlepay` so test mode visually shows the buttons (clicks short-circuit to a simulated Authorised)
- `public/.well-known/apple-developer-merchantid-domain-association` — placeholder file; user will replace contents with the file Adyen provides
- `src/components/venue/PaymentSettingsTab.tsx` — add a small "Wallets" status row showing whether Apple Pay / Google Pay are enabled for this venue (read from `/paymentMethods` test call), plus a one-line note about needing to enable them in Adyen CA
- `mem://features/payments` (new) + `mem://index.md` — record the Drop-in architecture decision and Apple Pay domain-verification requirement

## Out of scope (stays as-is)

- Tax & gratuity calculation
- Stored-card management for signed-in diners (already works; just rendered above Drop-in)
- Order creation flow and audit-date handling
- Live Adyen credentials provisioning (admin task in Adyen CA — no code change beyond what's already in `venue_payment_config`)
- PayPal, Klarna, BNPL — Drop-in supports them but we're scoping this PR to wallets + cards

## Expected result

- Anonymous diner on iPhone Safari sees an **Apple Pay** button → Face ID → paid in ~2 seconds, no card entry
- Anonymous diner on Android Chrome sees a **Google Pay** button → fingerprint → paid
- Diner without a wallet (or unsupported browser) sees the same hosted card form as today
- Signed-in returning diner still sees their saved cards on top
- Test mode still works end-to-end with mocked wallet buttons

