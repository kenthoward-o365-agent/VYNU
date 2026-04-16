

# Fix: Payment Test Mode Not Working

## Root Cause

Provider name mismatch between the client and the edge function:

- `PaymentSettingsTab.tsx` saves config with `provider: "ordrpayments"`
- `CheckoutPanel.tsx` queries for `provider: "ordrpayments"` — finds the config, sets `paymentEnabled = true`
- `adyen-payment` edge function queries for `provider: "adyen"` (line 123) — finds **nothing**, returns 404: "No payment configuration found"

The `PaymentSettingsTab` was rebranded from "adyen" to "ordrpayments" but the edge function was never updated.

## Fix

### `supabase/functions/adyen-payment/index.ts`

Change the provider filter on line 123 from `"adyen"` to `"ordrpayments"`. Also add a fallback: if no `"ordrpayments"` config is found, try `"adyen"` for backward compatibility with any legacy data.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/adyen-payment/index.ts` | Query for `"ordrpayments"` provider first, fall back to `"adyen"` |

No database changes needed.

