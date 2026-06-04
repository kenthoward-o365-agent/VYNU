## Admin Financials — Phase 1

A new top-level **Financials** section in the Admin app for tracking subscription revenue, commissions, and contract terms across all venues. No Stripe billing or invoicing yet — that's Phase 2.

### Billing model (locked in)

- **Commission base**: order net revenue (excludes tax, includes tips/gratuities), excludes cancelled orders.
- **Monthly fee**: `min_monthly_fee + (commission_pct × net_revenue)` — min fee is a base, commission stacks on top.
- **Deferred revenue**: min monthly fee × remaining months in contract = forward-looking recognised-over-time schedule.

### 1. Schema additions

Extend `venue_billing_config` with:
- `contract_start_date` (date)
- `contract_end_date` (date)
- `billing_day_of_month` (int, 1–28, default 1)
- `estimated_annual_gmv` (numeric, default 0)
- `auto_renew` (bool, default true)
- `renewal_term_months` (int, default 12)
- `notice_period_days` (int, default 30)

New RPC `get_platform_financials(_from, _to)` returns per-venue + totals:
- `net_revenue` (sum order_items.unit_price×qty − tax + tips, billable orders only)
- `commission_earned` (net_revenue × commission_pct, resolving inheritance from parent venue)
- `min_fee_due` (count of months in range × min_monthly_fee, prorated for partial months)
- `total_billable` (commission + min_fee)
- `estimated_annual_gmv`, `forecast_annual_commission`
- `contract_start`, `contract_end`, `months_remaining`, `deferred_min_fee_revenue` (months_remaining × min_fee)
- `is_active`, venue meta

Admin-only (`has_role tabless_admin`).

### 2. Navigation

Add **Financials** entry to admin sidebar (`DashboardLayout`) between Venues and Partners. Icon: `DollarSign`.

### 3. New page: `src/pages/AdminFinancials.tsx`

Tabs / sections:

**a. KPI strip** (with `AuditDatePicker` range selector)
- Active venues count
- Total net revenue (period)
- Total commission earned (period)
- Total min monthly fees (period)
- Total billable (commission + min fees)
- Total deferred revenue (forward-looking, sum of months_remaining × min_fee across active contracts)
- Forecast annual commission (sum of estimated_GMV × commission)

**b. Venue revenue table**
Columns: Venue · Status · Contract dates · Commission % · Min Fee · Net Revenue · Commission Earned · Min Fees Due · Total · Est. GMV · Forecast Comm. — sortable, exportable CSV.

**c. Deferred revenue schedule**
Monthly grid for next 24 months: each row = month, columns = venues (or aggregate), cell = min_fee recognised that month. Stops at contract_end (unless auto_renew → projects forward by renewal_term_months). Chart + table view.

**d. Contracts overview**
List of venues with contract end within next 90 days (renewal alerts), and venues missing contract dates.

### 4. BillingConfigTab additions (per-venue)

Add a **Contract** card above existing billing fields:
- Contract start/end date pickers (shadcn date picker, range)
- Billing day of month (1–28 select)
- Estimated annual GMV (input)
- Auto-renew toggle + renewal term (months) + notice period (days)

Show computed projections inline:
- "Forecast annual commission: $X.XX (based on Est. GMV × commission %)"
- "Remaining contracted min-fee revenue: $X.XX (Y months × $Z)"

### 5. Routing

`/admin/financials` route in `App.tsx`, admin-gated.

### Out of scope (Phase 2)

Stripe subscription billing, invoice generation, payment collection, venue-app billing portal, dunning, tax invoices.

### Files

**New**
- `supabase/migrations/<ts>_financials_phase1.sql` — column adds + RPC
- `src/pages/AdminFinancials.tsx`
- `src/components/admin/FinancialsKpiStrip.tsx`
- `src/components/admin/VenueRevenueTable.tsx`
- `src/components/admin/DeferredRevenueSchedule.tsx`
- `src/components/admin/ContractsOverview.tsx`

**Edited**
- `src/components/venue/BillingConfigTab.tsx` — contract fields + projections
- `src/components/DashboardLayout.tsx` — nav entry
- `src/App.tsx` — route
