

# Rebrand Payments to "OrdrPayments" (Ordrup as PayFac)

## Overview
Replace all Adyen-specific branding and references with "OrdrPayments" — Ordrup's own payment facilitation brand. The current payment infrastructure (edge function, mock mode, stored cards, checkout flow) stays intact structurally, but all user-facing text shifts from "Adyen" to "OrdrPayments". Since Ordrup is the PayFac, venues no longer need to bring their own Adyen credentials — the configuration simplifies to an activation toggle with OrdrPayments managing the underlying processing.

## Changes

### 1. Payment Settings Tab (`src/components/venue/PaymentSettingsTab.tsx`)
- Replace all "Adyen" text with "OrdrPayments"
- Change card title to "OrdrPayments Configuration"
- Remove Adyen docs link — replace with Ordrup help text
- Update helper text: "Powered by OrdrPayments" instead of "Connect your Adyen merchant account"
- Remove the merchant account and API key fields (Ordrup is the PayFac — venues don't enter their own keys)
- Simplify to: environment toggle (test/live), enable payments switch, test connection button
- Keep mock mode and test cards section
- Update status banner text ("OrdrPayments active" etc.)

### 2. Checkout Panel (`src/components/consumer/CheckoutPanel.tsx`)
- Change provider filter from `"adyen"` to `"ordrpayments"` in `checkPaymentEnabled`
- Update edge function URL references from `adyen-payment` to `ordr-payment` (or keep same function, just rebrand)
- Add "Secured by OrdrPayments" badge at bottom of payment form

### 3. Edge Function (`supabase/functions/adyen-payment/index.ts`)
- Keep the existing function name for now (avoid breaking routes)
- Update internal comments from "Adyen" to "OrdrPayments"
- The mock mode continues to work as-is — when Ordrup has real PayFac credentials, the live path will route through Ordrup's merchant account rather than per-venue Adyen keys

### 4. Knowledge Base (`src/pages/KnowledgeBase.tsx`)
- Update the Payments subsection: "OrdrPayments" instead of "Adyen"
- Describe it as Ordrup's built-in payment processing

### 5. Database consideration
- The `venue_payment_config` table has `provider` column — new rows will use `"ordrpayments"` instead of `"adyen"`
- No schema migration needed — the provider column is already a text field

### 6. Memory update
- Update `.lovable/memory/index.md` to note OrdrPayments as the built-in PayFac

## Technical details
- Provider string changes from `"adyen"` to `"ordrpayments"` in all queries and inserts
- The edge function `adyen-payment` keeps its route name to avoid redeployment churn — can be renamed later
- PaymentSettingsTab simplifies significantly: no API key fields, no merchant account — just enable/disable and environment toggle
- Mock mode remains for testing without real processing credentials

