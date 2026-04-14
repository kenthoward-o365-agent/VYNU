
-- =============================================================
-- STEP 0: Clean orphan records before adding FK constraints
-- =============================================================

DELETE FROM public.chat_messages_log WHERE session_id NOT IN (SELECT id FROM public.chat_sessions);
DELETE FROM public.chat_messages_log WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.chat_sessions WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.chat_sessions WHERE diner_id IS NOT NULL AND diner_id NOT IN (SELECT id FROM public.diner_profiles);
DELETE FROM public.chat_sessions WHERE table_id IS NOT NULL AND table_id NOT IN (SELECT id FROM public.tables);
DELETE FROM public.order_items WHERE order_id NOT IN (SELECT id FROM public.orders);
DELETE FROM public.order_items WHERE menu_item_id NOT IN (SELECT id FROM public.menu_items);
DELETE FROM public.order_status_log WHERE order_id NOT IN (SELECT id FROM public.orders);
DELETE FROM public.orders WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.orders WHERE table_id IS NOT NULL AND table_id NOT IN (SELECT id FROM public.tables);
DELETE FROM public.menu_items WHERE venue_id NOT IN (SELECT id FROM public.venues);
UPDATE public.menu_items SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM public.menu_categories);
DELETE FROM public.menu_categories WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.menu_item_modifiers WHERE menu_item_id NOT IN (SELECT id FROM public.menu_items);
DELETE FROM public.menu_item_modifiers WHERE modifier_category_id NOT IN (SELECT id FROM public.modifier_categories);
DELETE FROM public.menu_item_time_frames WHERE menu_item_id NOT IN (SELECT id FROM public.menu_items);
DELETE FROM public.menu_item_time_frames WHERE time_frame_id NOT IN (SELECT id FROM public.menu_time_frames);
DELETE FROM public.menu_time_frames WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.modifier_categories WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.modifiers WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.modifiers WHERE category_id NOT IN (SELECT id FROM public.modifier_categories);
DELETE FROM public.pricing_rules WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.pricing_rule_items WHERE pricing_rule_id NOT IN (SELECT id FROM public.pricing_rules);
DELETE FROM public.pricing_rule_items WHERE menu_item_id NOT IN (SELECT id FROM public.menu_items);
DELETE FROM public.pricing_rule_types WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.tables WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.staff_alerts WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.staff_alerts WHERE table_id IS NOT NULL AND table_id NOT IN (SELECT id FROM public.tables);
DELETE FROM public.staff_alerts WHERE diner_id IS NOT NULL AND diner_id NOT IN (SELECT id FROM public.diner_profiles);
DELETE FROM public.venue_staff WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.venue_ai_config WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.venue_billing_config WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.venue_payment_config WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.venue_group_staff WHERE group_id NOT IN (SELECT id FROM public.venue_groups);
DELETE FROM public.loyalty_programs WHERE venue_id IS NOT NULL AND venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.loyalty_programs WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM public.venue_groups);
DELETE FROM public.loyalty_balances WHERE diner_id NOT IN (SELECT id FROM public.diner_profiles);
DELETE FROM public.loyalty_balances WHERE program_id NOT IN (SELECT id FROM public.loyalty_programs);
DELETE FROM public.diner_visits WHERE diner_id NOT IN (SELECT id FROM public.diner_profiles);
DELETE FROM public.diner_visits WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.diner_visits WHERE order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM public.orders);
DELETE FROM public.diner_stored_cards WHERE diner_id NOT IN (SELECT id FROM public.diner_profiles);
DELETE FROM public.diner_stored_cards WHERE venue_id NOT IN (SELECT id FROM public.venues);
DELETE FROM public.diner_profiles WHERE user_id IS NULL;
UPDATE public.venues SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM public.venue_groups);

-- =============================================================
-- STEP 1: Drop existing FKs then re-add with CASCADE
-- =============================================================

-- chat_messages_log
ALTER TABLE public.chat_messages_log DROP CONSTRAINT IF EXISTS chat_messages_log_session_id_fkey;
ALTER TABLE public.chat_messages_log DROP CONSTRAINT IF EXISTS chat_messages_log_venue_id_fkey;
ALTER TABLE public.chat_messages_log
  ADD CONSTRAINT chat_messages_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  ADD CONSTRAINT chat_messages_log_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- chat_sessions
ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_venue_id_fkey;
ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_diner_id_fkey;
ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_table_id_fkey;
ALTER TABLE public.chat_sessions
  ADD CONSTRAINT chat_sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT chat_sessions_diner_id_fkey FOREIGN KEY (diner_id) REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT chat_sessions_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;

-- orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_venue_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_table_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;

-- order_items
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

-- order_status_log
ALTER TABLE public.order_status_log DROP CONSTRAINT IF EXISTS order_status_log_order_id_fkey;
ALTER TABLE public.order_status_log
  ADD CONSTRAINT order_status_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- menu_items
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_venue_id_fkey;
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE SET NULL;

-- menu_categories
ALTER TABLE public.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_venue_id_fkey;
ALTER TABLE public.menu_categories
  ADD CONSTRAINT menu_categories_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- menu_item_modifiers
ALTER TABLE public.menu_item_modifiers DROP CONSTRAINT IF EXISTS menu_item_modifiers_menu_item_id_fkey;
ALTER TABLE public.menu_item_modifiers DROP CONSTRAINT IF EXISTS menu_item_modifiers_modifier_category_id_fkey;
ALTER TABLE public.menu_item_modifiers
  ADD CONSTRAINT menu_item_modifiers_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ADD CONSTRAINT menu_item_modifiers_modifier_category_id_fkey FOREIGN KEY (modifier_category_id) REFERENCES public.modifier_categories(id) ON DELETE CASCADE;

-- menu_item_time_frames
ALTER TABLE public.menu_item_time_frames DROP CONSTRAINT IF EXISTS menu_item_time_frames_menu_item_id_fkey;
ALTER TABLE public.menu_item_time_frames DROP CONSTRAINT IF EXISTS menu_item_time_frames_time_frame_id_fkey;
ALTER TABLE public.menu_item_time_frames
  ADD CONSTRAINT menu_item_time_frames_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ADD CONSTRAINT menu_item_time_frames_time_frame_id_fkey FOREIGN KEY (time_frame_id) REFERENCES public.menu_time_frames(id) ON DELETE CASCADE;

-- menu_time_frames
ALTER TABLE public.menu_time_frames DROP CONSTRAINT IF EXISTS menu_time_frames_venue_id_fkey;
ALTER TABLE public.menu_time_frames
  ADD CONSTRAINT menu_time_frames_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- modifier_categories
ALTER TABLE public.modifier_categories DROP CONSTRAINT IF EXISTS modifier_categories_venue_id_fkey;
ALTER TABLE public.modifier_categories
  ADD CONSTRAINT modifier_categories_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- modifiers
ALTER TABLE public.modifiers DROP CONSTRAINT IF EXISTS modifiers_venue_id_fkey;
ALTER TABLE public.modifiers DROP CONSTRAINT IF EXISTS modifiers_category_id_fkey;
ALTER TABLE public.modifiers
  ADD CONSTRAINT modifiers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT modifiers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.modifier_categories(id) ON DELETE CASCADE;

-- tables
ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_venue_id_fkey;
ALTER TABLE public.tables
  ADD CONSTRAINT tables_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- venue_staff
ALTER TABLE public.venue_staff DROP CONSTRAINT IF EXISTS venue_staff_venue_id_fkey;
ALTER TABLE public.venue_staff DROP CONSTRAINT IF EXISTS venue_staff_user_id_fkey;
ALTER TABLE public.venue_staff
  ADD CONSTRAINT venue_staff_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT venue_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- staff_alerts
ALTER TABLE public.staff_alerts DROP CONSTRAINT IF EXISTS staff_alerts_venue_id_fkey;
ALTER TABLE public.staff_alerts DROP CONSTRAINT IF EXISTS staff_alerts_table_id_fkey;
ALTER TABLE public.staff_alerts DROP CONSTRAINT IF EXISTS staff_alerts_diner_id_fkey;
ALTER TABLE public.staff_alerts
  ADD CONSTRAINT staff_alerts_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT staff_alerts_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL,
  ADD CONSTRAINT staff_alerts_diner_id_fkey FOREIGN KEY (diner_id) REFERENCES public.diner_profiles(id) ON DELETE SET NULL;

-- venue_ai_config
ALTER TABLE public.venue_ai_config DROP CONSTRAINT IF EXISTS venue_ai_config_venue_id_fkey;
ALTER TABLE public.venue_ai_config
  ADD CONSTRAINT venue_ai_config_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- venue_billing_config
ALTER TABLE public.venue_billing_config DROP CONSTRAINT IF EXISTS venue_billing_config_venue_id_fkey;
ALTER TABLE public.venue_billing_config
  ADD CONSTRAINT venue_billing_config_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- venue_payment_config
ALTER TABLE public.venue_payment_config DROP CONSTRAINT IF EXISTS venue_payment_config_venue_id_fkey;
ALTER TABLE public.venue_payment_config
  ADD CONSTRAINT venue_payment_config_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- pricing_rules
ALTER TABLE public.pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_venue_id_fkey;
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- pricing_rule_items
ALTER TABLE public.pricing_rule_items DROP CONSTRAINT IF EXISTS pricing_rule_items_pricing_rule_id_fkey;
ALTER TABLE public.pricing_rule_items DROP CONSTRAINT IF EXISTS pricing_rule_items_menu_item_id_fkey;
ALTER TABLE public.pricing_rule_items
  ADD CONSTRAINT pricing_rule_items_pricing_rule_id_fkey FOREIGN KEY (pricing_rule_id) REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  ADD CONSTRAINT pricing_rule_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

-- pricing_rule_types
ALTER TABLE public.pricing_rule_types DROP CONSTRAINT IF EXISTS pricing_rule_types_venue_id_fkey;
ALTER TABLE public.pricing_rule_types
  ADD CONSTRAINT pricing_rule_types_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- diner_visits
ALTER TABLE public.diner_visits DROP CONSTRAINT IF EXISTS diner_visits_diner_id_fkey;
ALTER TABLE public.diner_visits DROP CONSTRAINT IF EXISTS diner_visits_venue_id_fkey;
ALTER TABLE public.diner_visits DROP CONSTRAINT IF EXISTS diner_visits_order_id_fkey;
ALTER TABLE public.diner_visits
  ADD CONSTRAINT diner_visits_diner_id_fkey FOREIGN KEY (diner_id) REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT diner_visits_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT diner_visits_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- diner_stored_cards
ALTER TABLE public.diner_stored_cards DROP CONSTRAINT IF EXISTS diner_stored_cards_diner_id_fkey;
ALTER TABLE public.diner_stored_cards DROP CONSTRAINT IF EXISTS diner_stored_cards_venue_id_fkey;
ALTER TABLE public.diner_stored_cards
  ADD CONSTRAINT diner_stored_cards_diner_id_fkey FOREIGN KEY (diner_id) REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT diner_stored_cards_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- loyalty_programs
ALTER TABLE public.loyalty_programs DROP CONSTRAINT IF EXISTS loyalty_programs_venue_id_fkey;
ALTER TABLE public.loyalty_programs DROP CONSTRAINT IF EXISTS loyalty_programs_group_id_fkey;
ALTER TABLE public.loyalty_programs
  ADD CONSTRAINT loyalty_programs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD CONSTRAINT loyalty_programs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.venue_groups(id) ON DELETE CASCADE;

-- loyalty_balances
ALTER TABLE public.loyalty_balances DROP CONSTRAINT IF EXISTS loyalty_balances_diner_id_fkey;
ALTER TABLE public.loyalty_balances DROP CONSTRAINT IF EXISTS loyalty_balances_program_id_fkey;
ALTER TABLE public.loyalty_balances
  ADD CONSTRAINT loyalty_balances_diner_id_fkey FOREIGN KEY (diner_id) REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT loyalty_balances_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.loyalty_programs(id) ON DELETE CASCADE;

-- venue_group_staff
ALTER TABLE public.venue_group_staff DROP CONSTRAINT IF EXISTS venue_group_staff_group_id_fkey;
ALTER TABLE public.venue_group_staff DROP CONSTRAINT IF EXISTS venue_group_staff_user_id_fkey;
ALTER TABLE public.venue_group_staff
  ADD CONSTRAINT venue_group_staff_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  ADD CONSTRAINT venue_group_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_roles
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- venues
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_group_id_fkey;
ALTER TABLE public.venues
  ADD CONSTRAINT venues_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.venue_groups(id) ON DELETE SET NULL;

-- =============================================================
-- STEP 2: Fix RLS Policies
-- =============================================================

DROP POLICY IF EXISTS "Anon can read chat messages" ON public.chat_messages_log;
DROP POLICY IF EXISTS "Anon can read chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Anon can update own chat sessions" ON public.chat_sessions;

CREATE POLICY "Anon can update chat sessions by id"
  ON public.chat_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (venue_id IS NOT NULL);

DROP POLICY IF EXISTS "Anon can view order items for their orders" ON public.order_items;

-- Storage: Fix venue-assets DELETE/UPDATE
DROP POLICY IF EXISTS "Authenticated users can delete venue assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update venue assets" ON storage.objects;

CREATE POLICY "Staff can delete venue assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'venue-assets'
    AND is_venue_staff(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY "Staff can update venue assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'venue-assets'
    AND is_venue_staff(auth.uid(), (string_to_array(name, '/'))[1]::uuid)
  );

-- =============================================================
-- STEP 3: Add Missing Indexes
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_orders_venue_created ON public.orders (venue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_venue_staff_user_venue ON public.venue_staff (user_id, venue_id);

-- =============================================================
-- STEP 4: Remove Duplicate Indexes
-- =============================================================

DROP INDEX IF EXISTS public.idx_chat_messages_session;
DROP INDEX IF EXISTS public.idx_chat_messages_venue;
DROP INDEX IF EXISTS public.idx_chat_sessions_venue;
DROP INDEX IF EXISTS public.idx_diner_stored_cards_diner;
DROP INDEX IF EXISTS public.idx_diner_stored_cards_venue;

-- =============================================================
-- STEP 5: Fix diner_profiles.user_id nullable
-- =============================================================

ALTER TABLE public.diner_profiles ALTER COLUMN user_id SET NOT NULL;

-- =============================================================
-- STEP 6: Drop orphan column venues.tax_id
-- =============================================================

ALTER TABLE public.venues DROP COLUMN IF EXISTS tax_id;

-- =============================================================
-- STEP 7: Add venue DELETE policy for admins
-- =============================================================

CREATE POLICY "Admins can delete venues"
  ON public.venues FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));
