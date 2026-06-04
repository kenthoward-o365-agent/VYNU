
# H&L Pay AR Suite — Recurring Venue Billing (with PCI-compliant self-serve onboarding)

Build an end-to-end accounts-receivable system that automatically charges each venue their monthly commission + minimum fee via Stripe (card, ACH, BECS, or manual), chases failed payments, and gives admin staff a full dashboard with reporting. **Card and bank credentials are never touched by our servers or our UI** — collection happens on Stripe-hosted surfaces so we stay PCI DSS **SAQ A** (the lowest scope tier).

---

## 1. Stripe connection (platform BYOK)

- Add secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (publishable is safe in code but kept as a secret so admins can rotate without a deploy).
- Single platform Stripe account. Each venue = a Stripe **Customer**. Each payment method = a Stripe **PaymentMethod** attached to that customer. No Stripe Connect.

---

## 2. PCI-compliant credential collection (the key piece)

Two equally-valid self-serve paths, both keep us in **SAQ A** scope (no card data ever touches our origin):

### Path A — Stripe **Checkout in `setup` mode** (default, simplest)
- Edge function `ar-create-setup-checkout` creates a Stripe Checkout Session with `mode: 'setup'`, `customer: <venue stripe id>`, `payment_method_types: ['card','au_becs_debit','us_bank_account']` (filtered by what the venue selects), and `success_url` / `cancel_url` pointing back to our app.
- Returns the Stripe-hosted URL. We redirect the venue there. They enter card/bank details on **checkout.stripe.com** — our domain never sees them.
- On success, Stripe fires `setup_intent.succeeded` → our webhook attaches the PM to the customer, sets it as default, and records it in `venue_payment_methods`.

### Path B — Stripe **Payment Element / Elements** embedded (optional, nicer UX)
- Same SetupIntent under the hood, rendered inline via `@stripe/stripe-js` + `@stripe/react-stripe-js`. The Element is an **iframe served by Stripe** — still SAQ A because the PAN never enters our DOM.
- Useful for the in-app "Add card" modal inside `/admin/venues/:id` and the venue's own settings page.

We ship **both**: Checkout (for emailed self-serve links) and Elements (for in-app flows).

### Self-serve email link
- Edge function `ar-issue-onboarding-link` (admin-only) generates a one-time, signed, time-boxed token (`ar_onboarding_tokens` table — `venue_id`, `token_hash`, `expires_at`, `used_at`, `methods_allowed[]`). It returns a URL like `https://app.../billing/setup/<token>`.
- The token page (`/billing/setup/:token`) is **public, unauthenticated**, verifies the token via an edge function (`ar-verify-onboarding-token`), then immediately redirects to a freshly created Stripe Checkout setup session. No login required — the token *is* the auth.
- On return (`success_url`), the page shows confirmation and marks the token `used_at = now()`.
- Tokens are single-use, default 7-day expiry, and stored hashed (sha256), never plaintext.

### What we store
**Never**: PAN, CVV, full bank account number, expiry beyond the masked form Stripe returns.
**Stored** (returned by Stripe): `stripe_payment_method_id`, `brand`, `last4`, `exp_month`, `exp_year`, `bank_name`, `bsb_last4` / `routing_last4`, `mandate_id`, `mandate_status`, `fingerprint`. That's it.

### Mandates (BECS / ACH)
- BECS and ACH require an explicit mandate. Stripe Checkout/Elements display the legally-required mandate text and capture acceptance for us. The mandate ID + acceptance timestamp + IP are stored on the `venue_payment_methods` row.
- For BECS, statement descriptor is set per-venue (max 18 chars, AU rule).

### PCI documentation
- Add `docs/pci/saq-a-attestation.md` describing the scope: all card data flows through Stripe-hosted surfaces (Checkout + Elements iframes); no PAN/CVV/track data is transmitted, processed, or stored by our systems; quarterly review of CSP, TLS, and Stripe.js integrity is already covered by the existing PCI docs in `docs/pci/`.
- Tighten `Content-Security-Policy` to allow only `https://js.stripe.com` and `https://*.stripe.com` for scripts/frames used by the billing pages.

---

## 3. Data model (new tables in `public`, all with GRANTs + RLS)

- **`venue_billing_accounts`** — `venue_id`, `stripe_customer_id`, `default_payment_method_id`, `payment_method_type` (`card`|`ach`|`becs`|`manual`), `billing_email`, `billing_name`, `is_active`.
- **`venue_payment_methods`** — masked PM metadata (above). Multiple per venue, one default.
- **`ar_onboarding_tokens`** — self-serve link tokens (hashed, single-use, expiring).
- **`venue_invoices`** — `period_start`, `period_end`, `due_date`, `commission_amount`, `min_fee_amount`, `adjustments`, `subtotal`, `tax`, `total`, `currency`, `status` (`draft`|`open`|`paid`|`partially_paid`|`failed`|`void`|`uncollectible`|`manual_pending`), `pdf_url`, `stripe_payment_intent_id`, `attempt_count`, `next_retry_at`, `paid_at`.
- **`venue_invoice_lines`** — itemised lines.
- **`venue_invoice_payments`** — every charge attempt + result.
- **`venue_billing_events`** — append-only audit log.
- **`venue_credit_notes`** — credits/refunds.
- **`ar_dunning_schedules`** — configurable retry cadence (seeded with Gentle: 3/7/14/21 days, email each, no auto-suspend, manual review at day 21).
- **`processed_stripe_events`** — idempotency for webhooks.

RLS: full access for `tabless_admin`; venue managers read-only on their own venue's invoices + payment methods; `ar_onboarding_tokens` admin-only.

---

## 4. Edge functions

| Function | Purpose |
|---|---|
| `ar-issue-onboarding-link` | Admin generates a self-serve setup link (token). |
| `ar-verify-onboarding-token` | Public — verifies token and returns a fresh Stripe Checkout setup URL. |
| `ar-create-setup-checkout` | Logged-in venue/admin opens Stripe Checkout in setup mode. |
| `ar-create-setup-intent` | Returns SetupIntent client secret for the inline Payment Element. |
| `ar-list-payment-methods` | Lists masked PMs for a venue. |
| `ar-set-default-method` | Marks a PM default. |
| `ar-detach-method` | Detaches in Stripe + table. |
| `ar-stripe-webhook` | Handles `setup_intent.succeeded`, `payment_intent.succeeded/failed`, `mandate.updated`, `charge.refunded`, `payment_method.detached`. Idempotent via `processed_stripe_events`. Verified with `STRIPE_WEBHOOK_SECRET`. |
| `ar-generate-invoices` | For today, generates invoices for venues whose `billing_day_of_month` matches. Idempotent per (venue, period). |
| `ar-charge-due-invoices` | Charges `open` invoices with `due_date <= today`. Uses `idempotency_key = invoice_id`. |
| `ar-retry-failed-invoices` | Walks failed invoices whose `next_retry_at <= now()`. |
| `ar-send-dunning-email` | Sends failure / reminder emails via existing email infra. |
| `ar-generate-invoice-pdf` | Renders PDF (`pdf-lib`), uploads to private `ar-invoices` bucket. |
| `ar-manual-mark-paid` | Admin records an out-of-band payment. |

All admin functions validate `has_role(... 'tabless_admin')` in code. Webhook + token-verify functions are public (signature/token based).

---

## 5. Nightly batch (cron)

Single pg_cron at **3:00 AM AEST (16:00 UTC)**, chained via `pg_net` and guarded by `pg_advisory_lock(hashtext('ar_nightly'))`:

1. `ar-generate-invoices`
2. `ar-charge-due-invoices`
3. `ar-retry-failed-invoices`
4. `ar-send-dunning-email`

Admin "Run now" (dry-run + live) for testing.

---

## 6. Dunning (Gentle, configurable)

Failed charge → retries at **day 3, 7, 14, 21** with escalating emails + in-app `staff_alerts`. Day-21 fail → `uncollectible` + manual review flag. No auto-suspend. Cadence lives in `ar_dunning_schedules`.

---

## 7. Admin UI (new `AR / Billing` nav)

- **Dashboard** — KPIs (Open, Overdue, Collected MTD, Failed, Forecast), 0–30/31–60/61–90/90+ aging bars, recent failures, upcoming charges (7 days). One `get_ar_dashboard` RPC.
- **Invoices** — server-paginated, status/venue/date filters; drawer with lines, attempts, audit, PDF download, mark-paid, void, credit-note.
- **Venues** — `venue_billing_accounts` list with default PM, last charge, next due, dunning state.
  - **"Send setup link" button** → calls `ar-issue-onboarding-link`, copies URL to clipboard + emails it.
  - **"Add payment method" button** → opens in-app Stripe Elements modal.
- **Reports** — CSV exports: collections by month, commission earned vs collected, failed payments, top overdue, projected ARR.
- **Settings** — dunning editor, currency, batch time override.

Inside each venue's existing **Commercials** tab at `/admin/venues/:id`, add a **Payment method** section with the masked default PM and the two buttons above.

---

## 8. Venue-facing UI

- New **Billing & Invoices** tab under venue Settings → Commercials:
  - List own invoices, statuses, download PDFs.
  - **Add / replace payment method** → inline Stripe Payment Element.
  - Display current mandate + ability to revoke (detaches in Stripe).

- New **public** route `/billing/setup/:token` for the emailed self-serve flow — verifies token, redirects to Stripe Checkout, shows success page on return.

All venue-facing copy says **H&L Pay**; Stripe is not named in venue UI (Stripe surfaces themselves carry their own branding, which is permitted).

---

## 9. Reporting

`get_ar_dashboard(_from, _to)` and `list_ar_invoices(...)` RPCs return pre-aggregated data + paginated rows. CSV built client-side from the list RPC.

---

## 10. Performance & safety

- Indexes: `(venue_id)`, `(status, due_date)`, partial `(next_retry_at) WHERE status='failed'`, `(stripe_event_id)` unique on `processed_stripe_events`, `(token_hash)` unique on `ar_onboarding_tokens`.
- Webhook idempotent on `stripe_event_id`.
- Charging idempotent on `invoice_id`.
- All money `numeric(12,2)` + ISO currency.
- Tokens hashed at rest, single-use, expiring.

---

## 11. Rollout

1. Migration: tables + RLS + GRANTs + indexes + cron.
2. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`.
3. Stripe Dashboard: enable `card`, `au_becs_debit`, `us_bank_account` PM types; configure webhook endpoint.
4. Edge functions (webhook + setup flows first, then invoicing, then dunning).
5. Admin UI (Venues + Add-PM flow → Dashboard → Invoices → Reports → Settings).
6. Venue-facing tab + public `/billing/setup/:token`.
7. PCI doc + CSP tightening.
8. Backfill: dry-run invoice generation for current month, review, enable live charging.

## Technical notes

- `npm:stripe@^17` server-side; `@stripe/stripe-js` + `@stripe/react-stripe-js` client-side.
- Webhook deployed with `verify_jwt = false` + in-code HMAC verification.
- Cron registered via `supabase--insert` (`net.http_post` with anon key).
- PDFs via `pdf-lib` (no native deps); stored in private `ar-invoices` bucket with short-lived signed URLs.
- Self-serve token route is the only public-unauthenticated billing surface; everything else requires admin or venue-manager auth.
