-- ============================================================================
-- PHASE 1 — SCALING: indexes + RLS consolidation
-- Goal: cut sequential scans on hot tables and collapse 4–6 overlapping
-- permissive SELECT policies into one per role-class.
-- Functional access is preserved — same logic, just OR'd into a single policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 RLS HELPER FUNCTIONS — mark PARALLEL SAFE so the planner can hoist them
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.is_venue_staff(uuid, uuid)        PARALLEL SAFE;
ALTER FUNCTION public.is_venue_manager(uuid, uuid)      PARALLEL SAFE;
ALTER FUNCTION public.has_role(uuid, public.app_role)   PARALLEL SAFE;
ALTER FUNCTION public.is_group_admin(uuid, uuid)        PARALLEL SAFE;
ALTER FUNCTION public.is_group_member(uuid, uuid)       PARALLEL SAFE;
ALTER FUNCTION public.get_user_diner_profile_id()       PARALLEL SAFE;
ALTER FUNCTION public.can_manage_loyalty_program_balance(uuid, uuid) PARALLEL SAFE;

-- ----------------------------------------------------------------------------
-- 1.2 COMPOSITE INDEXES on hot query patterns
-- ----------------------------------------------------------------------------
-- Orders kitchen list: WHERE venue_id AND status IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_orders_venue_status_created
  ON public.orders (venue_id, status, created_at DESC);

-- Diner open-order lookup: WHERE venue_id AND customer_id AND status IN (active)
CREATE INDEX IF NOT EXISTS idx_orders_venue_customer_active
  ON public.orders (venue_id, customer_id, created_at DESC)
  WHERE status IN ('received','preparing','ready');

-- Audit-date partitioned reads
CREATE INDEX IF NOT EXISTS idx_orders_venue_audit_date
  ON public.orders (venue_id, audit_date);

-- Throttled-orders polling
CREATE INDEX IF NOT EXISTS idx_orders_throttled_until
  ON public.orders (venue_id, throttled_until)
  WHERE throttled_until IS NOT NULL;

-- Session firing
CREATE INDEX IF NOT EXISTS idx_orders_session_id
  ON public.orders (session_id) WHERE session_id IS NOT NULL;

-- Open table sessions (currently 31k idx_scan but seq scan on auto_close_at filter)
CREATE INDEX IF NOT EXISTS idx_table_sessions_open
  ON public.table_sessions (venue_id, table_id)
  WHERE status = 'open';

-- venue_taxes is 100% seq scan
CREATE INDEX IF NOT EXISTS idx_venue_taxes_venue
  ON public.venue_taxes (venue_id);

-- venue_ai_config is 70% seq scan
CREATE INDEX IF NOT EXISTS idx_venue_ai_config_venue
  ON public.venue_ai_config (venue_id);

-- menu_time_frames 99% seq scan
CREATE INDEX IF NOT EXISTS idx_menu_time_frames_venue
  ON public.menu_time_frames (venue_id);

-- menu_categories filtered active reads
CREATE INDEX IF NOT EXISTS idx_menu_categories_venue_active
  ON public.menu_categories (venue_id)
  WHERE is_active = true;

-- menu_items filtered available reads (the consumer page hot query)
CREATE INDEX IF NOT EXISTS idx_menu_items_venue_available
  ON public.menu_items (venue_id, category_id, display_order)
  WHERE is_available = true;

-- pricing_rules active lookups
CREATE INDEX IF NOT EXISTS idx_pricing_rules_venue_active
  ON public.pricing_rules (venue_id)
  WHERE is_active = true;

-- venue_staff role lookups (idx_scan/seq_scan = 14k/36k today)
CREATE INDEX IF NOT EXISTS idx_venue_staff_user_active
  ON public.venue_staff (user_id, venue_id)
  WHERE is_active = true;

-- venue_groups lookups (87% seq scan)
CREATE INDEX IF NOT EXISTS idx_venues_group_id
  ON public.venues (group_id) WHERE group_id IS NOT NULL;

-- diner_visits hot reads
CREATE INDEX IF NOT EXISTS idx_diner_visits_venue_diner
  ON public.diner_visits (venue_id, diner_id, visited_at DESC);

-- ----------------------------------------------------------------------------
-- 1.3 RLS CONSOLIDATION — ORDERS
-- Before: 3 SELECT policies (admin / staff / diner-own). After: 1.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all orders"  ON public.orders;
DROP POLICY IF EXISTS "Diners can view own orders"  ON public.orders;
DROP POLICY IF EXISTS "Staff can view venue orders" ON public.orders;

CREATE POLICY "orders_select_consolidated"
ON public.orders FOR SELECT
TO authenticated
USING (
  is_venue_staff((SELECT auth.uid()), venue_id)
  OR customer_id = (SELECT auth.uid())
  OR customer_id = public.get_user_diner_profile_id()
  OR has_role((SELECT auth.uid()), 'tabless_admin'::public.app_role)
);

-- ----------------------------------------------------------------------------
-- 1.4 RLS CONSOLIDATION — ORDER_ITEMS
-- Before: 2 overlapping SELECT policies. After: 1.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can view order items"             ON public.order_items;

CREATE POLICY "order_items_select_consolidated"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        is_venue_staff((SELECT auth.uid()), o.venue_id)
        OR o.customer_id = (SELECT auth.uid())
        OR o.customer_id = public.get_user_diner_profile_id()
      )
  )
);

-- ----------------------------------------------------------------------------
-- 1.5 RLS CONSOLIDATION — MENU_ITEMS
-- Before: 4 SELECT policies (admin / authenticated-true / public-true / staff).
-- "Authenticated users can view all menu items" with USING (true) already grants
-- read to every signed-in user — collapse to a single permissive policy.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all items"                 ON public.menu_items;
DROP POLICY IF EXISTS "Authenticated users can view all menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Public can view all items"                 ON public.menu_items;
DROP POLICY IF EXISTS "Staff can view all items"                  ON public.menu_items;

CREATE POLICY "menu_items_select_public"
ON public.menu_items FOR SELECT
TO anon, authenticated
USING (true);

-- ----------------------------------------------------------------------------
-- 1.6 RLS CONSOLIDATION — MENU_CATEGORIES
-- Before: 5 SELECT policies. After: 1 (active rows readable by everyone, full
-- read for staff/admin).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all categories"               ON public.menu_categories;
DROP POLICY IF EXISTS "Authenticated users can view active categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Public can view active categories"            ON public.menu_categories;
DROP POLICY IF EXISTS "Staff can view categories"                    ON public.menu_categories;

CREATE POLICY "menu_categories_select_active_public"
ON public.menu_categories FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "menu_categories_select_staff_full"
ON public.menu_categories FOR SELECT
TO authenticated
USING (
  is_venue_staff((SELECT auth.uid()), venue_id)
  OR has_role((SELECT auth.uid()), 'tabless_admin'::public.app_role)
);

-- ----------------------------------------------------------------------------
-- 1.7 RLS CONSOLIDATION — TABLES
-- Before: 3 SELECT policies (authenticated-true / public-true / staff).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view tables" ON public.tables;
DROP POLICY IF EXISTS "Public can view tables"              ON public.tables;
DROP POLICY IF EXISTS "Staff can view tables"               ON public.tables;

CREATE POLICY "tables_select_public"
ON public.tables FOR SELECT
TO anon, authenticated
USING (true);

-- ----------------------------------------------------------------------------
-- 1.8 RLS CONSOLIDATION — VENUES
-- Before: 5 SELECT policies. After: 1 consolidated.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all venues"                ON public.venues;
DROP POLICY IF EXISTS "Authenticated users can view active venues" ON public.venues;
DROP POLICY IF EXISTS "Group admins can view group venues"        ON public.venues;
DROP POLICY IF EXISTS "Public can view venue info"                ON public.venues;
DROP POLICY IF EXISTS "Staff can view their venues"               ON public.venues;

CREATE POLICY "venues_select_active_public"
ON public.venues FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "venues_select_internal_full"
ON public.venues FOR SELECT
TO authenticated
USING (
  is_venue_staff((SELECT auth.uid()), id)
  OR (group_id IS NOT NULL AND is_group_admin((SELECT auth.uid()), group_id))
  OR has_role((SELECT auth.uid()), 'tabless_admin'::public.app_role)
);

-- ----------------------------------------------------------------------------
-- 1.9 RLS CONSOLIDATION — VENUE_STAFF (#1 hottest table — 36k seq scans)
-- Before: 2 SELECT policies. After: 1.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all staff"   ON public.venue_staff;
DROP POLICY IF EXISTS "Staff can view venue staff"  ON public.venue_staff;

CREATE POLICY "venue_staff_select_consolidated"
ON public.venue_staff FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())  -- a user can always see their own staff rows
  OR is_venue_staff((SELECT auth.uid()), venue_id)
  OR has_role((SELECT auth.uid()), 'tabless_admin'::public.app_role)
);

-- ----------------------------------------------------------------------------
-- 1.10 ANALYZE so the planner picks up the new indexes immediately
-- ----------------------------------------------------------------------------
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.menu_items;
ANALYZE public.menu_categories;
ANALYZE public.tables;
ANALYZE public.venues;
ANALYZE public.venue_staff;
ANALYZE public.table_sessions;
ANALYZE public.venue_taxes;
ANALYZE public.venue_ai_config;
ANALYZE public.diner_visits;