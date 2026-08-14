-- ============================================================================
-- 1. Add 'refunded' to the order_status enum
-- ============================================================================
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'refunded';

-- ============================================================================
-- 2. venue_roles — custom per-venue roles
-- ============================================================================
CREATE TABLE public.venue_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

CREATE INDEX idx_venue_roles_venue ON public.venue_roles(venue_id);

ALTER TABLE public.venue_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view venue roles"
  ON public.venue_roles FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert venue roles"
  ON public.venue_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Managers can update venue roles"
  ON public.venue_roles FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id) AND is_system = false);

CREATE POLICY "Managers can delete venue roles"
  ON public.venue_roles FOR DELETE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id) AND is_system = false);

CREATE TRIGGER trg_venue_roles_updated_at
  BEFORE UPDATE ON public.venue_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. venue_role_permissions — permission grid per role
-- ============================================================================
CREATE TABLE public.venue_role_permissions (
  role_id uuid PRIMARY KEY REFERENCES public.venue_roles(id) ON DELETE CASCADE,
  nav_keys text[] NOT NULL DEFAULT '{}',
  can_update_order_status boolean NOT NULL DEFAULT false,
  can_reopen_and_refund_orders boolean NOT NULL DEFAULT false,
  can_manage_roles boolean NOT NULL DEFAULT false,
  can_manage_settings boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view role permissions"
  ON public.venue_role_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_roles vr
    WHERE vr.id = role_id AND public.is_venue_staff(auth.uid(), vr.venue_id)
  ));

CREATE POLICY "Managers can insert role permissions"
  ON public.venue_role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.venue_roles vr
    WHERE vr.id = role_id AND public.is_venue_manager(auth.uid(), vr.venue_id)
  ));

CREATE POLICY "Managers can update role permissions"
  ON public.venue_role_permissions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_roles vr
    WHERE vr.id = role_id AND public.is_venue_manager(auth.uid(), vr.venue_id)
  ));

CREATE POLICY "Managers can delete role permissions"
  ON public.venue_role_permissions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venue_roles vr
    WHERE vr.id = role_id AND public.is_venue_manager(auth.uid(), vr.venue_id)
  ));

CREATE TRIGGER trg_venue_role_permissions_updated_at
  BEFORE UPDATE ON public.venue_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. Auto-seed system roles + permissions when a venue is created
-- ============================================================================
CREATE OR REPLACE FUNCTION public.seed_venue_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner_id uuid;
  _manager_id uuid;
  _staff_id uuid;
  _all_nav text[] := ARRAY[
    'dashboard','orders','tables','menu','modifiers','pricing','rule_types',
    'order_statuses','diners','loyalty','analytics','sippa_analytics','knowledge_base','settings'
  ];
  _staff_nav text[] := ARRAY['dashboard','orders','tables'];
BEGIN
  INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
  VALUES (NEW.id, 'Owner', 'Full access including role management', true, 0)
  RETURNING id INTO _owner_id;

  INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
  VALUES (NEW.id, 'Manager', 'Full operational access (excluding role management)', true, 1)
  RETURNING id INTO _manager_id;

  INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
  VALUES (NEW.id, 'Staff', 'Front-of-house: dashboard, orders, tables', true, 2)
  RETURNING id INTO _staff_id;

  INSERT INTO public.venue_role_permissions
    (role_id, nav_keys, can_update_order_status, can_reopen_and_refund_orders, can_manage_roles, can_manage_settings)
  VALUES
    (_owner_id,   _all_nav,   true,  true,  true,  true),
    (_manager_id, _all_nav,   true,  true,  false, true),
    (_staff_id,   _staff_nav, true,  false, false, false);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_venue_roles
  AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.seed_venue_roles();

-- ============================================================================
-- 5. Backfill: seed system roles for all existing venues
-- ============================================================================
DO $$
DECLARE
  _v record;
  _owner_id uuid;
  _manager_id uuid;
  _staff_id uuid;
  _all_nav text[] := ARRAY[
    'dashboard','orders','tables','menu','modifiers','pricing','rule_types',
    'order_statuses','diners','loyalty','analytics','sippa_analytics','knowledge_base','settings'
  ];
  _staff_nav text[] := ARRAY['dashboard','orders','tables'];
BEGIN
  FOR _v IN SELECT id FROM public.venues LOOP
    INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
    VALUES (_v.id, 'Owner', 'Full access including role management', true, 0)
    ON CONFLICT (venue_id, name) DO UPDATE SET is_system = true
    RETURNING id INTO _owner_id;

    INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
    VALUES (_v.id, 'Manager', 'Full operational access (excluding role management)', true, 1)
    ON CONFLICT (venue_id, name) DO UPDATE SET is_system = true
    RETURNING id INTO _manager_id;

    INSERT INTO public.venue_roles (venue_id, name, description, is_system, display_order)
    VALUES (_v.id, 'Staff', 'Front-of-house: dashboard, orders, tables', true, 2)
    ON CONFLICT (venue_id, name) DO UPDATE SET is_system = true
    RETURNING id INTO _staff_id;

    INSERT INTO public.venue_role_permissions
      (role_id, nav_keys, can_update_order_status, can_reopen_and_refund_orders, can_manage_roles, can_manage_settings)
    VALUES (_owner_id, _all_nav, true, true, true, true)
    ON CONFLICT (role_id) DO NOTHING;

    INSERT INTO public.venue_role_permissions
      (role_id, nav_keys, can_update_order_status, can_reopen_and_refund_orders, can_manage_roles, can_manage_settings)
    VALUES (_manager_id, _all_nav, true, true, false, true)
    ON CONFLICT (role_id) DO NOTHING;

    INSERT INTO public.venue_role_permissions
      (role_id, nav_keys, can_update_order_status, can_reopen_and_refund_orders, can_manage_roles, can_manage_settings)
    VALUES (_staff_id, _staff_nav, true, false, false, false)
    ON CONFLICT (role_id) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================================
-- 6. venue_staff.role_id (FK to venue_roles) + backfill from legacy enum
-- ============================================================================
ALTER TABLE public.venue_staff
  ADD COLUMN role_id uuid REFERENCES public.venue_roles(id) ON DELETE SET NULL;

CREATE INDEX idx_venue_staff_role_id ON public.venue_staff(role_id);

-- Map legacy enum -> seeded system roles
UPDATE public.venue_staff vs
SET role_id = vr.id
FROM public.venue_roles vr
WHERE vr.venue_id = vs.venue_id
  AND vr.is_system = true
  AND lower(vr.name) = lower(vs.role::text);

-- ============================================================================
-- 7. orders.payment_psp_reference (for refund lookups)
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN payment_psp_reference text;

CREATE INDEX idx_orders_psp_reference ON public.orders(payment_psp_reference) WHERE payment_psp_reference IS NOT NULL;

-- ============================================================================
-- 8. order_refunds — audit log
-- ============================================================================
CREATE TABLE public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AUD',
  reason text,
  psp_reference text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_refunds_order ON public.order_refunds(order_id);
CREATE INDEX idx_order_refunds_venue ON public.order_refunds(venue_id);

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view venue refunds"
  ON public.order_refunds FOR SELECT TO authenticated
  USING (public.is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Managers can insert refunds"
  ON public.order_refunds FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_manager(auth.uid(), venue_id) AND requested_by = auth.uid());

CREATE POLICY "Managers can update refunds"
  ON public.order_refunds FOR UPDATE TO authenticated
  USING (public.is_venue_manager(auth.uid(), venue_id));

CREATE POLICY "Admins can view all refunds"
  ON public.order_refunds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE TRIGGER trg_order_refunds_updated_at
  BEFORE UPDATE ON public.order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
