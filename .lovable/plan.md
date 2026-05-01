## Goal

Land three cheap, code-only wins on `menu-snapshot` so the next Peak run reflects the real production hot path — then re-test. We treat Lovable Cloud as today's runtime; the AWS auto-scaling migration is the longer-term destination, so nothing here paints us into a corner (no Cloud-specific tricks, no Postgres extensions we couldn't replicate on RDS).

## Scope

Three fixes, one realistic load profile, one fresh PDF report. No infra changes, no schema changes.

---

## 1. Collapse `menu-snapshot` round-trips

**Today:** `menu-snapshot` issues 5 parallel queries, then a 6th (`pricing_rule_items`) sequentially after `pricing_rules` resolves, plus an optional 7th for `tables`. Every cache miss hits the DB 6–7 times.

**Change:** add a single `SECURITY DEFINER` SQL function `public.get_menu_snapshot(_venue_id uuid, _table_id uuid)` that returns one JSON blob with venue, items, categories, pricing rules + their item links, AI config, and the optional table row. Edge function becomes one `supabase.rpc('get_menu_snapshot', …)` call.

**Why this matters for AWS too:** fewer round-trips = fewer connection-seconds per request, which is the limiting factor on RDS just as much as on Cloud.

## 2. Single-flight guard against thundering herd

**Today:** when 500 diners scan a freshly-deployed venue at the same moment, all 500 cache-miss in parallel and all 500 hit Postgres.

**Change:** in-memory `Map<venueId, Promise<snapshot>>` inside the edge function module scope. Concurrent requests for the same venue within a single isolate await the same promise. This is a per-isolate guard (not cluster-wide) but cuts herd amplification by ~10–50x in practice and works identically on Lambda/Fargate later.

## 3. Realistic Zipfian venue picker in the load test

**Today:** `pickVenue()` uniform-random across 1,000 seeded venues → cache hit rate ≈ 0%, which is not how Friday night looks.

**Change:** add `pickVenueZipf()` to `scripts/loadtest/k6/common.js` using a precomputed Zipf CDF (alpha ≈ 1.1). ~80% of traffic hits the top 20 venues, matching real venue popularity distribution. Add a `DISTRIBUTION=zipf|uniform` env var on `peak-quick.js` so we can run both for comparison.

---

## 4. Verify and re-test

1. Vitest: extend `src/test/loadtest-harness.test.ts` with a Zipf-distribution sanity check (top-20 share ≥ 70%).
2. Deno test: small edge-function test that hits `menu-snapshot` twice in parallel for the same venue and asserts only one DB call landed (use a counter in a stub).
3. Re-run `peak-quick.js` at 1,500 VUs with `DISTRIBUTION=zipf` against the same 1,000 seeded venues. Expected: failure rate < 1%, p95 < 800ms, throughput several × higher.
4. Optional: re-run with `DISTRIBUTION=uniform` to keep a worst-case data point for the report.

## 5. Deliverables

- New PDF: `loadtest-peak-2026-05-01-v2.pdf` with before/after table, Zipf vs uniform comparison, and an explicit "what AWS scaling will buy us on top of this" section so the migration business case stays clean.
- Markdown source kept alongside.

---

## Technical details

**New SQL (one migration):**
```sql
CREATE OR REPLACE FUNCTION public.get_menu_snapshot(_venue_id uuid, _table_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'venue',      (SELECT to_jsonb(v) FROM venues v WHERE v.id = _venue_id),
    'table',      (SELECT to_jsonb(t) FROM tables t
                   WHERE t.venue_id = _venue_id
                     AND (_table_id IS NULL OR t.id::text = _table_id OR t.table_number = _table_id)
                   LIMIT 1),
    'items',      (SELECT coalesce(jsonb_agg(mi ORDER BY mi.display_order), '[]'::jsonb)
                   FROM menu_items mi
                   WHERE mi.venue_id = _venue_id AND mi.is_available = true),
    'categories', (SELECT coalesce(jsonb_agg(c ORDER BY c.display_order), '[]'::jsonb)
                   FROM menu_categories c
                   WHERE c.venue_id = _venue_id AND c.is_active = true),
    'pricing',    jsonb_build_object(
                    'rules', (SELECT coalesce(jsonb_agg(r), '[]'::jsonb)
                              FROM pricing_rules r
                              WHERE r.venue_id = _venue_id AND r.is_active = true),
                    'links', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'pricing_rule_id', l.pricing_rule_id,
                                'menu_item_id',    l.menu_item_id)), '[]'::jsonb)
                              FROM pricing_rule_items l
                              JOIN pricing_rules r ON r.id = l.pricing_rule_id
                              WHERE r.venue_id = _venue_id AND r.is_active = true)),
    'ai',         (SELECT to_jsonb(a) FROM venue_ai_config a WHERE a.venue_id = _venue_id),
    'generated_at', now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_menu_snapshot(uuid, uuid) TO anon, authenticated, service_role;
```

**Edge function shape:**
```ts
const inflight = new Map<string, Promise<unknown>>();
const key = `${venueId}|${tableId ?? ''}`;
let promise = inflight.get(key);
if (!promise) {
  promise = supabase.rpc('get_menu_snapshot', { _venue_id: venueId, _table_id: tableId })
    .then(({ data, error }) => { if (error) throw error; return data; })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
}
const body = await promise;
```

**Files touched:**
- `supabase/migrations/<new>.sql` — `get_menu_snapshot` RPC
- `supabase/functions/menu-snapshot/index.ts` — single RPC + single-flight
- `scripts/loadtest/k6/common.js` — `pickVenueZipf`, `DISTRIBUTION` env
- `scripts/loadtest/k6/peak-quick.js` — honour `DISTRIBUTION`
- `src/test/loadtest-harness.test.ts` — distribution test
- `supabase/functions/menu-snapshot/index.test.ts` — single-flight test
- `/mnt/documents/loadtest-peak-2026-05-01-v2.pdf` — refreshed report

**Out of scope (deliberately deferred to AWS migration):**
- PgBouncer / Supavisor tuning, read replicas, instance resize
- Cluster-wide single-flight (Redis) — per-isolate is enough at our scale
- Write-path load tests (orders, loyalty enqueue)
- CDN edge config beyond the existing `Cache-Control` header

## Risks

- The new RPC must return identical shape to today's response — covered by the existing `use-menu-snapshot.test.ts` plus a fresh contract test before swap-in.
- Single-flight inside an isolate can mask a real bug if the underlying RPC throws — `finally(() => inflight.delete(key))` handles that.
- Zipf alpha is a guess; we'll keep `uniform` runnable so we always have both data points.
