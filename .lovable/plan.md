## Goal
Stop the recurring security findings at the source by removing three structural causes: secret columns on payment/POS tables, drifting partition policies, and anon-readable consumer tables.

## Scope (three coordinated changes)

### 1. Move payment + POS secrets to Vault
Replace secret-bearing columns with `vault.secrets` UUID references so the columns can never leak again.

**`venue_payment_config`** — convert these columns to `*_secret_id uuid` pointers:
- `api_key_test`, `api_key_live`
- `client_key_test`, `client_key_live`
- `hmac_key`

**`venue_pos_integrations`** — already partially vaulted (`api_key_ref`, `client_secret_ref`); finish the job:
- Migrate `webhook_secret` → `webhook_secret_id uuid`
- Migrate any remaining string secrets in `secrets_map` → individual vault rows tracked in a `secrets_map` of `{field: secret_id}`

**Reader/writer surface:**
- Keep existing `admin-set-payment-credentials` and `admin-set-pos-credentials` edge functions as the only write path; they call new SECURITY DEFINER RPCs `set_payment_credential(_venue_id, _field, _value)` and the existing `set_pos_credential`.
- Add `get_payment_credential(_venue_id, _field)` (admin-only, SECURITY DEFINER, reads from Vault) for the Adyen edge function to use server-side.
- Drop the column-level `REVOKE` workaround — the columns no longer exist.
- One-time data migration: for each existing row, push current value into Vault, store the returned UUID, then drop the old column.

### 2. Fix partitioned log tables permanently
`api_request_log_*` and `pos_sync_log_*` regress every month because `ensure_monthly_partition` creates the partition but policies are copied from the parent at attach time, and any drift on the parent is re-applied each month.

- Rewrite `ensure_monthly_partition(_parent, _month)` to, after `CREATE TABLE ... PARTITION OF`, explicitly:
  - `REVOKE ALL ... FROM anon, public`
  - `GRANT SELECT ... TO authenticated` (only)
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
  - Re-create the canonical `TO authenticated` SELECT policies (admins/managers/staff) on the partition explicitly, idempotently.
- Run it once across all existing partitions to normalize current state.
- Add a comment in the function pointing to the security memory so future edits don't strip this.

### 3. Consumer flow = RPC-only, no anon table reads
Treat `anon` as RPC-only. Today `venues` and `tables` still have anon-reachable surfaces that keep tempting "just one more column" widenings.

- Revoke all remaining `anon` table SELECT grants except the bare minimum needed before a session exists (none, if we route everything through RPCs).
- Drop anon-scoped policies on `venues` and `tables`.
- Audit consumer client code and ensure every read goes through one of:
  - `lookup_venue_by_site_id(site_id)` — QR landing resolution
  - `get_venue_public_info(venue_id)` — landing page render (extend return columns if the landing editor needs more)
  - `get_menu_snapshot(venue_id, table_id)` — menu + table + AI config
  - `find_or_create_table_session(...)` — session start
  - `list_open_sessions_at_table(...)` — join existing session
  - `get_diner_order_status(order_id)` — order polling
- Update `VenueLanding.tsx`, `MenuFeed.tsx`, `ConsumerOrder.tsx`, and any other consumer components that still do `supabase.from('venues'|'tables').select(...)` to call the RPCs instead.
- Add a small ESLint rule (or a CI grep) that fails the build if `supabase.from('venues'|'tables'|'venue_payment_config'|'venue_pos_integrations').select` appears outside `src/pages/admin/**` or `src/components/admin/**` / `src/components/venue/**`.

## Migration order
1. **Migration A** — Add new `*_secret_id` columns, backfill from existing values into Vault, switch edge functions + Adyen function to read via new RPCs, drop old columns.
2. **Migration B** — Rewrite `ensure_monthly_partition` + normalize existing partitions.
3. **Migration C** — Revoke anon on `venues`/`tables`, drop anon policies; extend `get_venue_public_info` if needed.
4. **Client refactor** — Replace remaining consumer `from('venues'|'tables')` calls with RPCs.
5. **Lint rule** — Add the ESLint guard.
6. **Run** Supabase linter + security scan; expect zero new findings tied to these three classes.

## Out of scope
- `select("*")` cleanup on non-consumer tables (separate pass).
- CI automation of the security scan (separate change to the pipeline).
- Rotating any secrets — Vault migration preserves current values; rotation is operator action via the existing runbook.

## Risks
- Adyen edge function must be updated in lockstep with the column drop or live payments break. Mitigate by deploying the RPC + edge function read change first, verifying, then dropping columns in a follow-up migration.
- Landing editor may rely on extra `venues` columns; verify `get_venue_public_info` returns everything `VenueLanding.tsx` needs before revoking anon SELECT.
