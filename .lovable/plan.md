

# Dashboard Metrics Expansion

## Current State
The venue dashboard has: Financial Performance (4 cards) + Order Performance (donut chart) + placeholder Quick Actions / AI Insights cards. The `orders` table only tracks `created_at` and `updated_at` — there is no status history log, so we cannot compute ticket stage times yet.

## What We Will Build

### 1. Top 10 Menu Items (by Count and Revenue)
- Fetch `order_items` joined to `menu_items` for orders in the audit date range
- Aggregate by menu item: sum quantity (count) and sum (quantity * unit_price) (revenue)
- Display as two horizontal bar charts side-by-side: "Top 10 by Qty Sold" and "Top 10 by Revenue"
- Uses recharts `BarChart` with horizontal layout

### 2. Revenue by Hour (Bar Chart)
- Group billable orders by hour of `created_at`
- Show a vertical bar chart with hours on x-axis, revenue on y-axis
- Helps identify peak trading periods

### 3. Ticket Time Tracking (requires new table)
- **New table: `order_status_log`** — records every status transition with a timestamp
  - `id`, `order_id`, `status` (order_status enum), `changed_at` (timestamptz default now()), `changed_by` (uuid nullable)
  - RLS: staff can view/insert for their venue's orders
- **Trigger**: a Postgres trigger on `orders` that inserts a row into `order_status_log` whenever `status` changes
- **Dashboard widget**: "Avg Ticket Times" card showing average duration for each stage transition (Received→Preparing, Preparing→Ready, Ready→Served) as a simple table or stacked bar
- Data will populate going forward once the trigger is active

### 4. Table Utilization (Today only)
- Query `tables` for the venue, cross-reference with active orders to show occupied vs available
- Simple stat card: "X / Y Tables Occupied"

### 5. Replace Placeholder Cards
- Remove "Quick Actions" and "AI Insights" placeholder cards
- Replace with the real widgets above

## Technical Details

### Database Migration
```sql
-- order_status_log table
CREATE TABLE public.order_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  status order_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;

-- RLS: staff can view logs for their venue's orders
CREATE POLICY "Staff can view status logs"
  ON public.order_status_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_status_log.order_id
    AND is_venue_staff(auth.uid(), o.venue_id)
  ));

CREATE POLICY "Staff can insert status logs"
  ON public.order_status_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_status_log.order_id
    AND is_venue_staff(auth.uid(), o.venue_id)
  ));

-- Auto-log trigger
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_log (order_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_status_log
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Also log initial status on insert
CREATE OR REPLACE FUNCTION log_order_initial_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.order_status_log (order_id, status, changed_by)
  VALUES (NEW.id, NEW.status, auth.uid());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_initial_status_log
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION log_order_initial_status();
```

### Dashboard Layout (top to bottom)
1. Header + Audit Date picker (unchanged)
2. Financial Performance — 4 stat cards (unchanged)
3. Revenue by Hour — bar chart (new)
4. Order Performance donut + Table Utilization side-by-side
5. Top 10 Items by Qty + Top 10 Items by Revenue side-by-side
6. Avg Ticket Times card (new, data populates going forward)

### Files Changed
- **New migration** — `order_status_log` table, trigger, RLS
- **`src/pages/Dashboard.tsx`** — add all new widgets, remove placeholder cards

