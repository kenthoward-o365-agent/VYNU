# Load testing harness — Tab-Less / Shyndig

Reproducible load testing against the Lovable Cloud backend.
**Never** run Peak/Cliff against production without a quiet window and explicit
sign-off. The Smoke profile is safe at any time.

## Prereqs

- `k6` — `nix run nixpkgs#k6 -- run ...` works in the sandbox.
- `bun` — to run the seeder/report scripts.
- Env vars (only needed for seed/report, not for k6):
  - `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY`

## Three profiles

| Profile | VUs | Duration | Purpose |
|---------|-----|---------:|---------|
| `smoke` | 20 | ~5 min | Sanity check after each release |
| `peak`  | 5,000 (configurable up to ~50k) | ~17 min | Friday-night realistic |
| `cliff` | 20,000 (up to 200k) | ~28 min | Find the breaking point |

## Workflow

```bash
# 1. Seed venues (writes IDs to scripts/loadtest/.venue-ids)
bun run scripts/loadtest/seed.ts --count 1000

# 2. Smoke
nix run nixpkgs#k6 -- run \
  -e VENUE_IDS=$(cat scripts/loadtest/.venue-ids) \
  --summary-export out/smoke.json \
  scripts/loadtest/k6/smoke.js

# 3. Peak (start small with PEAK_VUS, scale up)
nix run nixpkgs#k6 -- run \
  -e VENUE_IDS=$(cat scripts/loadtest/.venue-ids) \
  -e PEAK_VUS=5000 \
  --summary-export out/peak.json \
  scripts/loadtest/k6/peak.js

# 4. Cliff — push until something breaks
nix run nixpkgs#k6 -- run \
  -e VENUE_IDS=$(cat scripts/loadtest/.venue-ids) \
  -e CLIFF_VUS=20000 \
  --summary-export out/cliff.json \
  scripts/loadtest/k6/cliff.js

# 5. Report → /mnt/documents/loadtest-<label>-<date>.md
bun run scripts/loadtest/report.ts --summary out/peak.json --label peak

# 6. Cleanup
psql "$SUPABASE_DB_URL" -f scripts/loadtest/teardown.sql
```

## What the harness exercises

- `menu-snapshot` edge function (Phase 2 cache).
- Anon RLS read path on `menu_items`, `venues`, `tables` (Phase 1 indexes).
- CDN cache hit ratio (look at `http_req_duration` distribution — bimodal = cache working).

Order-create + loyalty-enqueue scenarios are scaffolded but disabled by default
to keep the harness anonymous; flip them on once you've confirmed teardown
covers the new rows.

## Safety rails

- Everything created is named `LOADTEST_*` — `teardown.sql` removes only those.
- The Cliff profile has no hard thresholds; the goal is to *find* the cliff,
  not pass.
- Run `cloud_status` before Cliff — if the project isn't `ACTIVE_HEALTHY`,
  abort.
