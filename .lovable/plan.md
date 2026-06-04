# Admin analytics expansion — venue drill-down + platform rollups

Adds a deep "Performance" view per venue and rolls the same metrics into the Platform Overview. Tracks real AI token spend so we can show AI cost vs AI-attributed revenue per venue.

## What you'll see

**Per-venue (new "Performance" tab on `/admin/venues/:id`)**
- Financials: gross, net, tax, gratuities, AOV, refunds — for selected date range
- AI usage: chat sessions, messages, items added via AI, upsell prompts shown/accepted
- AI cost (USD/AUD): tokens in/out × model price, summed from new `ai_usage_log`
- AI-attributed revenue: orders from chat sessions where `converted_to_order=true` + orders that accepted an upsell prompt
- AI margin: AI revenue − AI cost
- Users: count of `venue_staff` (active vs inactive, by role)
- Diners: unique diners in range, trend vs prior period (▲/▼ %), new vs returning
- Menu: total items, priced items (price > 0), unpriced, % categorised
- Tables / QR codes: total tables, active QR codes
- POS posture: provider name, connection status, "Auto-push orders" ON/OFF, last sync, route mode (Push to POS vs OrderNow Orders Screen)

**Platform Overview (`/admin/dashboard`)**
- New KPI strip: total diners (with trend), total AI sessions, total AI cost, total AI-attributed revenue, total priced items, total tables/QRs
- New table column on Venue Performance: POS provider, Push mode, AI rev, AI cost
- New chart: top 10 venues by AI-attributed revenue

## Technical plan

### 1. Database (one migration)

```sql
-- AI cost tracking
CREATE TABLE public.ai_usage_log (
  id uuid PK,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  feature text NOT NULL,            -- 'diner_chat' | 'upsell' | 'menu_import' | 'image_gen' | 'onboarding' | 'insights'
  model text NOT NULL,              -- e.g. 'google/gemini-3-flash-preview'
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  total_tokens int GENERATED ALWAYS AS (prompt_tokens+completion_tokens) STORED,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  request_id text,                  -- X-Lovable-AIG-Run-ID
  session_id uuid,                  -- chat_sessions.id when applicable
  order_id uuid,                    -- when AI directly produced an order
  created_at timestamptz DEFAULT now()
);
-- Indexes on (venue_id, created_at), (feature), (session_id)
-- GRANT SELECT,INSERT to service_role; SELECT to authenticated; RLS: admins + venue staff can read own venue.

-- Upsell attribution
ALTER TABLE public.order_items
  ADD COLUMN ai_source text,        -- 'chat' | 'upsell' | null
  ADD COLUMN ai_session_id uuid;

-- Model price table (admin-editable, seeded)
CREATE TABLE public.ai_model_prices (
  model text PRIMARY KEY,
  input_per_1k_usd numeric(10,6) NOT NULL,
  output_per_1k_usd numeric(10,6) NOT NULL,
  updated_at timestamptz DEFAULT now()
);
-- Seed gemini-3-flash-preview, gpt-5-mini, etc.
```

### 2. Edge function instrumentation

Wrap existing AI calls (`diner-chat`, `upsell-suggest`, `onboarding-chat`, `ai-insights`, `import-menu`, `generate-menu-image`, `enhance-menu-image`, `generate-modifiers`, `batch-generate-images`) to:
- Read `usage` from AI SDK result
- Compute cost via `ai_model_prices`
- Insert one row to `ai_usage_log` per call
Add a shared `_shared/ai-usage.ts` helper.

When `diner-chat` adds an item to cart on the user's behalf, stamp the resulting `order_items` row with `ai_source='chat'` and `ai_session_id`. When an upsell suggestion is accepted, stamp `ai_source='upsell'`.

### 3. RPCs for fast aggregation

```sql
get_venue_performance(_venue_id, _from, _to)   -- returns single JSON row of all metrics above
get_platform_performance(_from, _to)           -- aggregate across venues
get_venue_diner_trend(_venue_id, _from, _to)   -- current vs prior-period diner counts
```
All `SECURITY DEFINER`, `search_path=public`, admin-gated via `has_role(auth.uid(),'tabless_admin')`.

### 4. Frontend

- `src/components/admin/VenuePerformanceTab.tsx` — new tab card grid, charts, deep links
- Wire into `src/pages/AdminVenueDetail.tsx` tabs list (`Performance` between Details and Users)
- `src/components/admin/PlatformKpiStrip.tsx` — new KPI row on `AdminDashboard`
- Extend `AdminDashboard` venue table with POS / Push / AI Rev / AI Cost columns
- New `TopAiRevenueChart.tsx`
- Date range driven by existing `AuditDatePicker`

### 5. Backfill

One-time SQL to pre-populate `ai_usage_log` is impossible (no historical token counts). Show "Tracking started <date>" tooltip on AI cost cards.

## Out of scope

- COGS on food/menu items (confirmed not needed)
- Per-staff productivity metrics
- Exporting reports to CSV/PDF (can follow up)
- Per-diner LTV view

## Notes / risks

- Cost figures depend on `ai_model_prices` being kept current; admins can edit. Lovable AI Gateway may change pricing — we surface the price source date.
- `ai_source` stamping on `order_items` requires modifying cart-add paths in `diner-chat` and `upsell-suggest`; existing items remain unattributed (shown as "Direct").
- Diner trend uses `diner_visits` (already exists) — no schema change needed.
