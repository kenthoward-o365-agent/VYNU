# Why the PR changes aren't live, and how to ship them

## What I found

Your code is in the project — the backend just never ran it.

- The repo contains the merged PR work (latest commit `49c5b66`, and `admin-set-pos-credentials/index.ts` last changed Aug 4).
- The running backend is still on the Jul 30 state: the four newest migrations (`20260803134535`, `20260803134536`, `20260804060000`, `20260804120000`) are **not** recorded as applied in the database, and the edge functions were last deployed Jul 30.

Merging a GitHub PR syncs source files into the project, but it does not deploy edge functions or run migrations. Those only happen when the changes are applied from inside Lovable. So the dialog behaviour is unchanged because both halves of the fix (the function code and the `set_pos_credential` service-role grant) are still sitting undeployed.

## Plan

1. Apply the four pending migrations, in order:
   - `20260803134535_fix_set_payment_secret_service_role.sql`
   - `20260803134536_hlrdrnw69_refund_request_id.sql`
   - `20260804060000_fix_set_pos_credential_service_role.sql`
   - `20260804120000_tab_payment_server_authoritative.sql`
   Each is re-checked for idempotency before running so nothing already present is clobbered.
2. Redeploy every edge function touched since Jul 30:
   `admin-set-pos-credentials`, `adyen-payment`, `copilot-chat`, `import-menu`, `landing-from-url`, `loyalty-earn`, `notify-order-ready`, `onboarding-chat`, `pubplus-air` — plus every function importing the changed `_shared/` and `adapters/` files, since shared code is bundled per function.
3. Verify: call `admin-set-pos-credentials` directly and check its logs show the new code path (explicit admin/venue-manager authorisation, then `set_pos_credential` via the service client), and confirm the POS connect dialog saves credentials and advances past "connecting".

## Technical notes

- Migration state lives in `supabase_migrations.schema_migrations`; the four files above are absent there, which is how I confirmed they never ran.
- `_shared/` and `adapters/` changes require redeploying each consuming function, not just the ones whose own folder changed.
- No source files change in this plan — this is a deploy/apply pass over existing committed work.
