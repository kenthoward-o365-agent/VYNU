# Apply the pending migrations and redeploy the changed functions

Everything pushed since the last deploy pass (commit `258e775`) covers PRs #16 through #22. Three migration files and five edge functions have never been applied or deployed. Frontend changes in the same range go live with the next publish and need no action here.

## What is actually missing (verified against the live database)

- `time_within_window` does not exist, and `resolve_menu_for_table` still uses the old same-day-only window test — so overnight menus (Bistro 10:00-02:00, Chloe's 16:00-00:00) are excluded for most of the trading day and the diner can land on an empty menu.
- `get_venue_package_public` does not exist, so the guest app cannot read a venue's package tier and shows features the package excludes.
- The plaintext credential columns on `venue_payment_config` are already gone from the database, but `get_venue_payment_config_meta` was never rewritten, so the Payments settings tab still reads dead columns.

## Steps

1. Apply `20260806120000_menu_overnight_schedule.sql` — adds the overnight-safe window helper and rewrites `resolve_menu_for_table`.
2. Apply `20260806140000_public_venue_feature_flags.sql` — adds the read-only `get_venue_package_public` function for the guest app.
3. Apply `20260810120000_fix_payment_config_dead_plaintext_columns.sql` — idempotent column drop plus the rewritten `get_venue_payment_config_meta` that derives credential presence from the Vault references.
4. Redeploy the five changed edge functions: `admin-set-payment-credentials`, `adyen-payment`, `diner-chat`, `send-receipt-sms`, `upsell-suggest`.

## Verification

- Confirm the three functions exist and `resolve_menu_for_table` references `time_within_window`.
- Call `resolve_menu_for_table` for a Young & Jackson table and confirm it returns the zone's Bistro menu at the current Melbourne time.
- Confirm `get_venue_payment_config_meta` returns a row for a configured venue instead of erroring.
- Confirm each function deploy builds cleanly.

## Notes

- No source files change; this is an apply-and-deploy pass over already-merged work.
- No secrets are regenerated and no cron schedules are touched.
- Older migrations still absent from the ledger stay untouched — their objects already exist in the database.
