

## Goal

Restore the credentials/configuration UI in **Settings → Payments**, but white-label everything as **OrdrPay** (PayFac model). No mention of "Adyen" anywhere a venue manager or diner can see — including the Knowledge Base, settings labels, button text, error messages, or memory files used to brief future AI sessions.

## Branding rule (new constraint, will be saved to memory)

- **User-facing**: always "OrdrPay" — the in-house PayFac that handles application, underwriting, merchant onboarding, funding, fee collection, chargebacks, and statements (powered internally by Valpay, also never named to end users).
- **Code/internal**: existing `adyen-payment` edge function, `venue_payment_config` columns, and Drop-in library imports stay as-is (renaming infra is out of scope and risky). The processor is an internal implementation detail.
- **Knowledge Base content** (`src/pages/KnowledgeBase.tsx` + any seeded articles): scrub any "Adyen" references, replace with "OrdrPay".

## Schema additions (`venue_payment_config`)

Same fields as before, but presented under OrdrPay branding:

- `client_key_test`, `client_key_live` — internal processor client keys (hidden from venue UI; auto-provisioned by OrdrPay onboarding, manager never enters these)
- `hmac_key` — webhook verification (internal, hidden)
- `apple_pay_merchant_id`, `google_pay_merchant_id` — wallet IDs (internal, hidden)
- `capture_mode` (`immediate` | `manual`) — **shown** to manager
- `statement_descriptor` — **shown** to manager (this is what their diners see on bank statements)
- `country_code` (default `AU`), `default_currency` (default `AUD`) — **shown**
- `merchant_status` (`pending` | `under_review` | `approved` | `suspended`) — **shown** as read-only badge
- `merchant_id_ordrpay` — OrdrPay-issued merchant ID, **shown** read-only

(All nullable / sensible defaults — no breaking changes.)

## UI — `src/components/venue/PaymentSettingsTab.tsx`

Single OrdrPay-branded card with three sections, no "advanced / bring your own" mode:

1. **OrdrPay Merchant Account** (top)
   - Status badge: Pending / Under Review / Approved / Suspended
   - OrdrPay Merchant ID (read-only, copy button)
   - "Start onboarding" / "Continue application" button (placeholder action — emits a toast for now; real KYC flow is a follow-up)
   - One-line copy: "OrdrPay handles your merchant account, funding, statements, and chargebacks."

2. **Payment Behaviour** (manager-editable)
   - Enable Payments toggle (existing)
   - Environment: Test / Live (existing — relabel "Test mode" / "Live mode")
   - Capture mode: Immediate / Manual authorise-then-capture
   - Statement descriptor (with helper: "What appears on your diner's bank statement, max 22 chars")
   - Country, Default currency

3. **Wallets & Methods** (read-only status, existing card retained)
   - Apple Pay / Google Pay / Cards — green check or grey dash, populated from a backend `payment_methods` test call
   - Footer link: "Apple Pay domain verification — automatic" (no mention of downloading files; OrdrPay handles it)

The existing **Test Connection** button stays — relabel to "Test OrdrPay connection".

## Edge function — `supabase/functions/adyen-payment/index.ts`

(File name stays internal; no rename.)

- `payment_methods` action: also return `client_key` so the Drop-in initialises without a second round trip.
- `create_payment` action: honour `capture_mode` from config (send `captureDelayHours: 0` + `additionalData.manualCapture: true` when `manual`).
- All log lines, error messages returned to the client → scrub "Adyen" wording, replace with "OrdrPay" (e.g. `"OrdrPay returned an error"`).

## Frontend Drop-in — `src/components/consumer/CheckoutPanel.tsx` + `AdyenDropin.tsx`

- Read `client_key` from the `payment_methods` response (already passed through).
- Any visible string ("Powered by Adyen", error messages) → "Powered by OrdrPay" or removed.
- Component file `AdyenDropin.tsx` — keep filename (internal), but rename the exported component to `OrdrPayDropin` and update the import in `CheckoutPanel.tsx`. (Or leave file rename for a follow-up — call the export `OrdrPayDropin` either way so no UI text leaks the underlying processor.)

## Knowledge Base scrub — `src/pages/KnowledgeBase.tsx`

- Search for "Adyen" / "adyen" in the page and any seeded article fixtures → replace with "OrdrPay".
- Any article describing how to get API keys or configure a processor account → replace with a single "OrdrPay onboarding" article describing the PayFac model (application → underwriting → approval → funding).

## Memory updates

- Update `mem://features/payments` → rewrite to describe OrdrPay (PayFac, internally on Valpay/processor X). Add a hard rule: "Never mention the underlying processor in user-facing UI, Knowledge Base, error messages, or future plans."
- Add a Core line to `mem://index.md`: "Payments product is **OrdrPay** (in-house PayFac). Never name the underlying processor in any user-visible surface."

## Files touched

- New migration → adds 9 columns to `venue_payment_config`
- `src/components/venue/PaymentSettingsTab.tsx` — full OrdrPay rebrand + new sections
- `supabase/functions/adyen-payment/index.ts` — return `client_key`, honour `capture_mode`, scrub user-visible strings
- `src/components/consumer/CheckoutPanel.tsx` — pick up `client_key` from server, rename import
- `src/components/consumer/AdyenDropin.tsx` — export as `OrdrPayDropin`, scrub UI strings
- `src/pages/KnowledgeBase.tsx` — scrub Adyen references
- `.lovable/memory/features/payments.md` — rewritten under OrdrPay framing
- `.lovable/memory/index.md` — add OrdrPay branding rule to Core

## Out of scope

- Real OrdrPay onboarding/KYC flow (button is a placeholder for this PR)
- Webhook handler edge function (HMAC-verified order sync) — separate PR
- Renaming the internal `adyen-payment` edge function or `AdyenDropin.tsx` filename
- Statements / chargeback / funding dashboards (future PayFac dashboard work)

## Expected result

- Manager opens **Settings → Payments** → sees OrdrPay-branded merchant status, behaviour controls, and wallet status. No "Adyen" anywhere.
- Diner checkout still works end-to-end with Apple Pay / Google Pay / cards.
- Knowledge Base contains only OrdrPay terminology.
- Future AI sessions read the memory file and continue using OrdrPay branding by default.

