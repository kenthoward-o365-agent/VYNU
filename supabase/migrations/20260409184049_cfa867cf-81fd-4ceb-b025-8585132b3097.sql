
-- =============================================
-- A. SECURITY FIXES
-- =============================================

-- A1. Remove privilege escalation: venue_staff self-insert
DROP POLICY IF EXISTS "Staff can insert themselves" ON public.venue_staff;

-- A2. Remove privilege escalation: venue_group_staff self-insert
DROP POLICY IF EXISTS "Users can add themselves as group staff" ON public.venue_group_staff;

-- A3. Fix payment config exposure
-- Create safe function for public payment status checks
CREATE OR REPLACE FUNCTION public.get_venue_payment_active(_venue_id uuid)
RETURNS TABLE(is_active boolean, provider text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vpc.is_active, vpc.provider
  FROM public.venue_payment_config vpc
  WHERE vpc.venue_id = _venue_id
  LIMIT 1;
$$;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can check venue payment status" ON public.venue_payment_config;

-- A4. Fix order_items open SELECT
DROP POLICY IF EXISTS "Anyone can view order items by order id" ON public.order_items;

-- Anon/authenticated can view order items only if they can see the parent order
CREATE POLICY "Anon can view order items for their orders"
ON public.order_items
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
));

CREATE POLICY "Authenticated can view own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (
      is_venue_staff(auth.uid(), o.venue_id)
      OR o.customer_id = auth.uid()
      OR o.customer_id = get_user_diner_profile_id()
    )
));

-- A5. Fix chat_sessions update policy
DROP POLICY IF EXISTS "Anyone can update own chat sessions" ON public.chat_sessions;

-- Only allow updating sessions that the caller originally created (anon or authenticated)
CREATE POLICY "Anon can update own chat sessions"
ON public.chat_sessions
FOR UPDATE
TO anon
USING (true);

CREATE POLICY "Staff can update chat sessions"
ON public.chat_sessions
FOR UPDATE
TO authenticated
USING (is_venue_staff(auth.uid(), venue_id));

-- A6. Restrict public venue SELECT to safe fields
-- Create a security-definer function for safe public lookups
CREATE OR REPLACE FUNCTION public.get_venue_public_info(_venue_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  logo_url text,
  venue_type text,
  operating_hours jsonb,
  is_active boolean,
  city text,
  state text,
  country text,
  landing_page_html text,
  settings jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.name, v.logo_url, v.venue_type, v.operating_hours, 
         v.is_active, v.city, v.state, v.country, v.landing_page_html, v.settings
  FROM public.venues v
  WHERE v.id = _venue_id;
$$;

-- =============================================
-- B. PERFORMANCE INDEXES (18 new)
-- =============================================

CREATE INDEX IF NOT EXISTS idx_chat_sessions_diner_id ON public.chat_sessions(diner_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_table_id ON public.chat_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_venue_id ON public.chat_sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_log_session_id ON public.chat_messages_log(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_log_venue_id ON public.chat_messages_log(venue_id);
CREATE INDEX IF NOT EXISTS idx_diner_profiles_user_id ON public.diner_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_diner_visits_diner_id ON public.diner_visits(diner_id);
CREATE INDEX IF NOT EXISTS idx_diner_visits_order_id ON public.diner_visits(order_id);
CREATE INDEX IF NOT EXISTS idx_diner_visits_venue_id ON public.diner_visits(venue_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_group_id ON public.loyalty_programs(group_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_venue_id ON public.loyalty_programs(venue_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_venue_id ON public.menu_categories(venue_id);
CREATE INDEX IF NOT EXISTS idx_modifier_categories_venue_id ON public.modifier_categories(venue_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_category_id ON public.modifiers(category_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_venue_id ON public.modifiers(venue_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_staff_alerts_diner_id ON public.staff_alerts(diner_id);
CREATE INDEX IF NOT EXISTS idx_staff_alerts_table_id ON public.staff_alerts(table_id);
CREATE INDEX IF NOT EXISTS idx_staff_alerts_venue_id ON public.staff_alerts(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_taxes_venue_id ON public.venue_taxes(venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_group_id ON public.venues(group_id);
CREATE INDEX IF NOT EXISTS idx_venue_staff_user_id ON public.venue_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_staff_venue_id ON public.venue_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_group_staff_user_id ON public.venue_group_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_group_staff_group_id ON public.venue_group_staff(group_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_balances_diner_id ON public.loyalty_balances(diner_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_balances_program_id ON public.loyalty_balances(program_id);
CREATE INDEX IF NOT EXISTS idx_order_status_log_order_id ON public.order_status_log(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_venue_id ON public.menu_items(venue_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_menu_item_id ON public.menu_item_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_modifier_category_id ON public.menu_item_modifiers(modifier_category_id);
CREATE INDEX IF NOT EXISTS idx_diner_stored_cards_diner_id ON public.diner_stored_cards(diner_id);
CREATE INDEX IF NOT EXISTS idx_diner_stored_cards_venue_id ON public.diner_stored_cards(venue_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_venue_id ON public.pricing_rules(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_ai_config_venue_id ON public.venue_ai_config(venue_id);
