

## Goal

Add a **Gratuities Report** to DayEnd > Reports filterable by audit date, plus a **live Gratuities tile** on the Dashboard that contributes to net revenue calculations.

## Current state

- Tip is only persisted as free text inside `orders.customer_notes` (e.g. `"Tip: $4.50"`). Not queryable, not reportable.
- `orders.total` already includes the tip (subtotal + tip).
- Dashboard computes `grossRevenue = sum(orders.total)` then derives `netRevenue` via `calculateTaxes`. Tip is currently being treated as taxable revenue, which is wrong.
- Reporting page just shows "Reports will be available here soon."

## Plan

### 1. Database — make gratuity a first-class field

Add to `orders`:
- `gratuity_amount numeric NOT NULL DEFAULT 0`
- `audit_date date` — populated at order creation from the venue's current audit date so reports tie to the operator's business day, not UTC wall-clock

Backfill existing rows: `gratuity_amount = 0`, `audit_date = created_at::date`. Acceptable since tips weren't tracked before.

Add a small public RPC `get_venue_audit_date(_venue_id uuid)` so the anonymous checkout flow can stamp the correct audit date without needing read access to `venue_audit_dates`.

### 2. Checkout — write structured gratuity

In `src/components/consumer/CheckoutPanel.tsx`:
- On order insert, set `gratuity_amount: tipAmount` and `audit_date: <fetched audit date>`.
- Keep `total = subtotal + tip` (no change to payment flow).
- Keep the `customer_notes` "Tip: $X" line for backwards visibility.

### 3. Dashboard — Gratuities tile + corrected net revenue

In `src/pages/Dashboard.tsx`:
- Pull `gratuity_amount` alongside `total`.
- New KPI tile **Gratuities** = `sum(gratuity_amount)` for the period.
- Fix net/gross so tips are excluded from taxable revenue:
  ```
  taxableTotal = sum(total) - sum(gratuity)
  { subtotalExTax, totalTax } = calculateTaxes(taxableTotal, taxes)
  grossRevenue = taxableTotal      // tips no longer inflate gross
  netRevenue   = subtotalExTax
  gratuities   = sum(gratuity)
  avgOrder     = taxableTotal / billable.length
  ```

### 4. Reporting page — Gratuities Report

In `src/pages/Reporting.tsx`, replace the placeholder card with a **Gratuities Report** card:
- Date selector using existing `AuditDatePicker` (Today / Yesterday / Last 7 days / Custom), default to current `auditDate`.
- Query `orders` by `audit_date` range, status ≠ `cancelled`.
- Summary: total tips, tip count, average tip, tips as % of taxable revenue.
- Detail table: audit date, order id (short), table, time, subtotal (ex tip), tip, tip %.
- Client-side **Export CSV** button.

Each report (Gratuities, future Tax/Sales reports) is its own card so we can add more later without restructuring.

### 5. Memory

Add `mem://features/gratuities` describing: gratuity is a structured `orders` column, excluded from taxable base, reported by `audit_date`.

## Files to change

- New migration: add `gratuity_amount` + `audit_date` columns to `orders`; add public RPC for audit date lookup
- `src/components/consumer/CheckoutPanel.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Reporting.tsx`
- `mem://features/gratuities` (+ `mem://index.md` update)

## Out of scope

- Splitting tips across staff
- Reconciling tips against payment provider settlement
- Other report types (Tax, Sales by Category) — added later as additional cards

