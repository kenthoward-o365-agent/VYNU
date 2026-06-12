## Status — Security hardening (3-phase plan)

**Phase 1 — Structural hardening (DONE)**
- Rewrote `ensure_monthly_partition` to REVOKE anon/PUBLIC, GRANT SELECT to authenticated only, ENABLE RLS, and re-apply canonical `TO authenticated` policies on every partition; normalized existing partitions; partition regressions are now physically impossible without editing the function itself.
- Dropped `venues_select_active_anon` policy and revoked anon SELECT on `venues`. All consumer reads go through SECURITY DEFINER RPCs.

**Phase 2 — Vault-ify payment & POS secrets (DONE, additive rollout)**
- Added Vault pointer columns alongside legacy plain columns:
  - `venue_payment_config.{api_key_test|api_key_live|client_key_test|client_key_live|hmac_key}_secret_id`
  - `venue_pos_integrations.webhook_secret_id`
- Added admin/service-only RPCs:
  - `set_payment_secret(_venue_id, _field, _value)` / `get_payment_secret(_venue_id, _field)`
  - `set_pos_webhook_secret(_venue_id, _value)` / `get_pos_webhook_secret(_venue_id)`
- Backfilled every existing plain-column secret into Vault and stored the UUID.
- `admin-set-payment-credentials` now writes secrets ONLY to Vault and nulls the legacy column on write; non-secret config fields (merchant account, identifiers, etc.) still use plain columns.
- `adyen-payment` now reads secrets from Vault first and falls back to the legacy column for not-yet-migrated rows.
- Legacy plain columns are kept (nullable, commented DEPRECATED). **Follow-up migration** will drop them after live verification:
  - `ALTER TABLE venue_payment_config DROP COLUMN api_key_test, api_key_live, client_key_test, client_key_live, hmac_key;`
  - `ALTER TABLE venue_pos_integrations DROP COLUMN webhook_secret;`

**Phase 3 — Lint guard against direct consumer reads of sensitive tables (DONE)**
- Added `no-restricted-syntax` rule in `eslint.config.js` that errors on `supabase.from('venues'|'tables'|'venue_payment_config'|'venue_pos_integrations').select(...)` inside:
  - `src/components/consumer/**`
  - `src/pages/Consumer*.tsx`
  - `src/pages/VenueLanding.tsx`
  - `src/hooks/use-diner-session.ts`
- Fixed the only true positive: `VenueDiscovery.tsx` now calls new `list_sibling_venues` RPC instead of querying `venues` directly.

## Open follow-ups
- Drop deprecated plain-secret columns after Adyen + POS edge functions are verified reading from Vault on live traffic.
- Optional: extend the ESLint guard to additional consumer files as they are added (or invert it to default-deny except admin/venue dirs).
