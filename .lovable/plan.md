
# Scaling to 1,000 venues — concrete plan

## What I found (the actual cliffs)

I ran live diagnostics against the database. Five real problems will hit hard well before 1,000 venues, in roughly this order:

1. **Duplicate-overlapping RLS policies on every hot table.** Every `SELECT` on `orders`, `menu_items`, `tables`, `venue_staff`, `venues` evaluates 4–6 policies as OR. `venue_staff` already shows **36,328 sequential scans** vs 14,327 indexed scans (72% seq). `diner_profiles` is **99.5% sequential scans**. `venue_display_areas` is **92% sequential**. This compounds linearly per-row per-policy.
2. **Realtime fan-out is unbounded.** `Orders.tsx` subscribes to `postgres_changes` for *every* order in the venue and on every event re-runs `fetchOrders()` + `fetchSessions()` (full re-query). With 200 diners ordering at one busy venue, every operator browser receives N×M events and re-fetches N times. Multiply by 1,000 venues and the realtime tier melts.
3. **Consumer QR-scan does 8+ serial round-trips.** `ConsumerOrder.tsx` fetches venue, items, categories, table (often twice — by id then by table_number fallback), pricing rules, rule items, AI config, diner profile, last order, last order items, and then opens 1–2 realtime channels — all on first paint. None of it is cached. 200 diners × 1,000 venues = ~1.6M queries per dinner service just to render menus.
4. **Heavy work runs in the request path.** Loyalty earn, upsell suggestions, image generation, menu import, modifier generation, and `diner-chat` all execute synchronously. AI calls (4–10s) block the user. There is no queue, no retry, no "we'll email you when ready".
5. **No load-testing harness exists.** We have zero numbers — we are guessing at the cliff.

Good news: `pg_cron`, `pg_net`, and `pg_stat_statements` are already enabled, and the schema is mostly well-indexed. The fixes are surgical, not a rewrite.

---

## The plan

### Phase 1 — Database: indexes + RLS cleanup (biggest win, lowest risk)

**1.1 Consolidate duplicate RLS policies.** Postgres evaluates every permissive policy. Today the same logical "can read" decision is split across 3–6 policies per table. Merge them into **one** SELECT policy per role-class per table using `OR`, so the planner caches one expression. Tables to clean: `orders`, `order_items`, `menu_items`, `menu_categories`, `tables`, `venues`, `venue_staff`, `pricing_rules`, `pricing_rule_items`.

**1.2 Add missing composite indexes** based on actual query patterns:

```sql
-- Orders kitchen view: WHERE venue_id = X AND status IN (...) ORDER BY created_at
CREATE INDEX CONCURRENTLY idx_orders_venue_status_created
  ON orders (venue_id, status, created_at DESC);

-- Open-order lookup for diner: WHERE venue_id AND customer_id AND status IN (...)
CREATE INDEX CONCURRENTLY idx_orders_venue_customer_status
  ON orders (venue_id, customer_id, status)
  WHERE status IN ('received','preparing','ready');

-- Hot active-table-sessions filter
CREATE INDEX CONCURRENTLY idx_table_sessions_open
  ON table_sessions (venue_id, table_id, status)
  WHERE status = 'open';

-- diner_profiles user lookup is 99.5% seq scan today
CREATE INDEX CONCURRENTLY idx_diner_profiles_user_id_unique
  ON diner_profiles (user_id);

-- venue_taxes / venue_display_areas / venue_ai_config are seq-scanned constantly
CREATE INDEX CONCURRENTLY idx_venue_taxes_venue ON venue_taxes (venue_id);
CREATE INDEX CONCURRENTLY idx_venue_ai_config_venue ON venue_ai_config (venue_id);
-- venue_display_areas already has venue_id idx, but RLS forces revisit; covered by 1.1.
```

**1.3 Mark all `is_venue_staff` / `is_venue_manager` / `has_role` helpers `STABLE PARALLEL SAFE`** (they already are STABLE — add PARALLEL SAFE) so the planner can hoist them out of per-row evaluation in larger queries.

**1.4 Use `(SELECT auth.uid())` inside policies** instead of bare `auth.uid()` — Supabase's documented trick that lets Postgres evaluate the function once per query instead of once per row. Apply this in the helper functions and key policies.

**Expected result:** orders list and menu queries 5–20× faster under load; `venue_staff` seq-scan ratio drops from 72% to <5%.

---

### Phase 2 — Caching: stop computing the same thing 1,000×

The menu and venue config rarely change but are fetched on every QR scan.

**2.1 React Query for client-side caching.** Add `@tanstack/react-query` provider (already common in Lovable templates). Wrap the heavy reads:
- `useVenuePublic(venueId)` — `staleTime: 5 min`
- `useMenu(venueId)` — `staleTime: 2 min`, invalidate on menu mutations
- `usePricingRules(venueId)` — `staleTime: 2 min`
- `useVenueAIConfig(venueId)` — `staleTime: 10 min`

This collapses the 8 serial QR-scan queries into ~3 the first time and **0** for repeat scans within the stale window.

**2.2 Edge-cached menu snapshot.** Add an edge function `menu-snapshot` that returns `{venue, categories, items, pricingRules}` as a single JSON blob with HTTP `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Lovable's edge runtime + browser cache gives us ~30–60s of zero-DB-load menu serving for repeat diners. Bust the cache by bumping `venues.updated_at` when staff publishes.

**2.3 Materialised "venue summary".** A small table `venue_runtime_cache (venue_id, menu_version, payment_active, loyalty_program_id, updated_at)` updated by triggers. The consumer page reads one row instead of joining 4 tables.

---

### Phase 3 — Realtime: stop the broadcast storm

**3.1 Replace "refetch on any change" with "patch in place".** In `Orders.tsx` use the realtime payload (`payload.new`, `payload.old`, `payload.eventType`) to update local state directly, instead of calling `fetchOrders()` on every event. Cuts kitchen-view DB load by ~95% during service.

**3.2 Narrow realtime filters.** Today operators subscribe to *all* orders for the venue. Add a second filter on `status=in.(received,preparing,ready)` so terminal/paid/cancelled updates don't fan out.

**3.3 Use a single multiplexed channel per venue,** not one channel per component (`ThrottleStatusBar`, `Orders`, `OrderThrottling` each open separate channels today). Add `src/hooks/useVenueRealtime.ts` that one component owns and others subscribe to via context.

**3.4 Heartbeat batching for display terminals.** Today every terminal pings every 60s with one DB UPDATE each. Replace with an edge function that accepts a batch of tokens, or accept the current cost — at 1,000 venues × 3 terminals = 3,000 UPDATEs/min, this is fine but worth knowing.

---

### Phase 4 — Async / background jobs

We need a queue. Two options:

**Option A (recommended): pg-native using `pgmq` + `pg_cron`.** Stays inside Lovable Cloud, no new connector, no new secret.
- Enable `pgmq` extension.
- Create queues: `loyalty_events`, `email_outbox`, `report_jobs`, `image_generation`, `upsell_warmup`.
- Producers are simple `SELECT pgmq.send('queue', payload)` calls (or done in the same trigger that creates an order).
- A worker edge function per queue, invoked every 10s by `pg_cron` → `net.http_post`, drains up to N messages, processes, deletes.
- For user-visible completion we write to a `job_status` table (`id, user_id, type, status, result, created_at`) and the UI subscribes via realtime to its own row only.

**Option B: Inngest.** Already documented as a Lovable connector. Better DX (retries, fan-out, scheduled, dashboard). Requires connecting Inngest. Use this if you want first-class durable workflows; otherwise pgmq is enough for the next year.

**Concrete migrations off the request path:**
- **`loyalty-earn`** — fire-and-forget enqueue from order webhook; today it blocks order confirmation.
- **Email sending** (receipts, "report ready", staff invites) — already async-ready, just needs the queue + a single sender function.
- **Reports** (daily revenue, top items, ticket times) — pre-compute nightly into a `daily_venue_metrics` table; analytics page reads from that table instead of scanning `orders` + `order_items` for the whole day.
- **Image generation / menu import / modifier generation** — already long-running; move to queue + `job_status` row + realtime "your menu import is ready" toast.
- **Upsell suggestions** — pre-warm common item pairs offline into a small `upsell_cache (venue_id, trigger_item_id, suggestions jsonb)` table refreshed nightly. The synchronous AI call becomes a cache lookup with AI fallback only on misses.

---

### Phase 5 — Load testing: simulate 1,000 venues

Build a reproducible harness in `scripts/loadtest/` (run from the sandbox; never against the live DB without consent).

**5.1 Seeder** (`seed.ts`):
- Create 1,000 venues, each with: 20 tables, 60 menu items across 8 categories, 1 pricing rule, default display areas.
- Use bulk INSERTs in batches of 500.
- Tag everything with `name LIKE 'LOADTEST_%'` so we can drop in one statement.

**5.2 Diner simulator** (`simulate.ts`) using `k6` (best fit; can run via `nix run nixpkgs#k6`):
- Per-venue scenario: 200 virtual diners, each performs scan → load menu → browse 30s → add 2–4 items → checkout.
- Ramp: 0 → 100k VUs over 10 min, hold 20 min, ramp down.
- Metrics: p50/p95/p99 for menu fetch, order create, realtime delivery latency, edge function cold/warm times, DB CPU, connection count.

**5.3 Three test profiles:**
- **Smoke:** 10 venues × 20 diners (sanity, ~5 min).
- **Peak:** 1,000 venues × 50 diners concurrent (Friday-night realistic).
- **Cliff:** 1,000 venues × 200 diners concurrent (the question you actually asked).

**5.4 Reporting:** `scripts/loadtest/report.ts` reads k6 JSON output + queries `pg_stat_statements` and writes a markdown report to `/mnt/documents/loadtest-{date}.md` with the slow-query top-20 and recommendations.

**5.5 Cleanup:** `scripts/loadtest/teardown.sql` removes `LOADTEST_%` rows in dependency order.

---

## Technical details (for the dev review)

**Migration order (safe to ship one phase per release):**
1. RLS consolidation + new indexes (Phase 1) — pure DB, no code change risk. Ship first.
2. React Query + edge-cached menu (Phase 2) — frontend change, gradual rollout per page.
3. Realtime patch-in-place + multiplexed channel (Phase 3) — touches `Orders.tsx`, `OrderThrottling.tsx`, `ThrottleStatusBar.tsx`, `ConsumerOrder.tsx`.
4. pgmq + worker functions + `job_status` table + realtime toast component (Phase 4).
5. Load test harness + first run (Phase 5) → tune based on numbers.

**Files that will change (rough scope):**
- New: `supabase/migrations/<ts>_scaling_indexes_and_rls.sql`, `supabase/migrations/<ts>_pgmq_queues.sql`, `supabase/functions/menu-snapshot/`, `supabase/functions/queue-worker-*/`, `src/hooks/useVenueRealtime.ts`, `src/hooks/useMenu.ts`, `src/components/JobStatusToaster.tsx`, `scripts/loadtest/{seed,simulate,report,teardown}.ts`.
- Modified: `src/pages/Orders.tsx`, `src/pages/OrderThrottling.tsx`, `src/pages/ConsumerOrder.tsx`, `src/components/orders/ThrottleStatusBar.tsx`, `src/main.tsx` (QueryClientProvider), `supabase/functions/loyalty-earn/index.ts`, `supabase/functions/upsell-suggest/index.ts`.

**Capacity targets after all 5 phases (estimates, to be confirmed by the load test):**
- Menu render p95 < 200 ms warm, < 600 ms cold.
- Order create p95 < 300 ms (currently includes synchronous loyalty work).
- Kitchen realtime delivery < 1 s p95.
- DB CPU < 60% at peak profile.

---

## Questions before we start

1. **Inngest vs pgmq for the queue (Phase 4)?** pgmq keeps everything in Lovable Cloud (zero new connector). Inngest gives a nicer dashboard, retries, and scheduled jobs out of the box. My recommendation: start with pgmq, add Inngest later only if you need the workflow visibility.
2. **Load test target environment.** The Cliff profile (200k concurrent diners) will briefly spike DB CPU. Do you want to run it against the live Lovable Cloud project (pick a quiet window), or should I set up a separate clone first?
3. **Phasing.** Ship all 5 phases as one big change, or one PR per phase (safer, gives you measurable wins each week)? I'd recommend one phase per release — Phase 1 alone will give a noticeable speed-up immediately.
