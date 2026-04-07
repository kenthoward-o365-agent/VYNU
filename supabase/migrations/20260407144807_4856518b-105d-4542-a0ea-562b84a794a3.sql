
-- Loyalty program type enum
CREATE TYPE public.loyalty_program_type AS ENUM ('points', 'stamps', 'tier');

-- Diner profiles
CREATE TABLE public.diner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  phone text,
  display_name text,
  preferences jsonb DEFAULT '{}'::jsonb,
  allergens text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diner_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_diner_profiles_updated_at
  BEFORE UPDATE ON public.diner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Diner visits
CREATE TABLE public.diner_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  visited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diner_visits ENABLE ROW LEVEL SECURITY;

-- Loyalty programs
CREATE TABLE public.loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  program_type loyalty_program_type NOT NULL DEFAULT 'points',
  rules jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_loyalty_programs_updated_at
  BEFORE UPDATE ON public.loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Loyalty balances
CREATE TABLE public.loyalty_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  tier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(diner_id, program_id)
);

ALTER TABLE public.loyalty_balances ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_loyalty_balances_updated_at
  BEFORE UPDATE ON public.loyalty_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: diner_profiles
CREATE POLICY "Diners can view own profile"
  ON public.diner_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Diners can update own profile"
  ON public.diner_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Diners can create own profile"
  ON public.diner_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view diners via visits"
  ON public.diner_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diner_visits dv
      JOIN public.venues v ON v.id = dv.venue_id
      WHERE dv.diner_id = diner_profiles.id
        AND (
          is_venue_staff(auth.uid(), v.id)
          OR (v.group_id IS NOT NULL AND is_group_admin(auth.uid(), v.group_id))
        )
    )
  );

-- RLS: diner_visits
CREATE POLICY "Diners can view own visits"
  ON public.diner_visits FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.diner_profiles dp WHERE dp.id = diner_id AND dp.user_id = auth.uid())
  );

CREATE POLICY "Staff can view venue visits"
  ON public.diner_visits FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id));

CREATE POLICY "Staff can insert visits"
  ON public.diner_visits FOR INSERT TO authenticated
  WITH CHECK (is_venue_staff(auth.uid(), venue_id));

-- RLS: loyalty_programs
CREATE POLICY "Staff can view venue loyalty programs"
  ON public.loyalty_programs FOR SELECT TO authenticated
  USING (
    (venue_id IS NOT NULL AND is_venue_staff(auth.uid(), venue_id))
    OR (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id))
  );

CREATE POLICY "Managers can manage venue loyalty programs"
  ON public.loyalty_programs FOR INSERT TO authenticated
  WITH CHECK (
    (venue_id IS NOT NULL AND is_venue_manager(auth.uid(), venue_id))
    OR (group_id IS NOT NULL AND is_group_admin(auth.uid(), group_id))
  );

CREATE POLICY "Managers can update loyalty programs"
  ON public.loyalty_programs FOR UPDATE TO authenticated
  USING (
    (venue_id IS NOT NULL AND is_venue_manager(auth.uid(), venue_id))
    OR (group_id IS NOT NULL AND is_group_admin(auth.uid(), group_id))
  );

CREATE POLICY "Managers can delete loyalty programs"
  ON public.loyalty_programs FOR DELETE TO authenticated
  USING (
    (venue_id IS NOT NULL AND is_venue_manager(auth.uid(), venue_id))
    OR (group_id IS NOT NULL AND is_group_admin(auth.uid(), group_id))
  );

-- RLS: loyalty_balances
CREATE POLICY "Diners can view own balances"
  ON public.loyalty_balances FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.diner_profiles dp WHERE dp.id = diner_id AND dp.user_id = auth.uid())
  );

CREATE POLICY "Staff can view balances for their programs"
  ON public.loyalty_balances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loyalty_programs lp
      WHERE lp.id = program_id
        AND (
          (lp.venue_id IS NOT NULL AND is_venue_staff(auth.uid(), lp.venue_id))
          OR (lp.group_id IS NOT NULL AND is_group_member(auth.uid(), lp.group_id))
        )
    )
  );

CREATE POLICY "Staff can manage balances"
  ON public.loyalty_balances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loyalty_programs lp
      WHERE lp.id = program_id
        AND (
          (lp.venue_id IS NOT NULL AND is_venue_staff(auth.uid(), lp.venue_id))
          OR (lp.group_id IS NOT NULL AND is_group_member(auth.uid(), lp.group_id))
        )
    )
  );

CREATE POLICY "Staff can update balances"
  ON public.loyalty_balances FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loyalty_programs lp
      WHERE lp.id = program_id
        AND (
          (lp.venue_id IS NOT NULL AND is_venue_staff(auth.uid(), lp.venue_id))
          OR (lp.group_id IS NOT NULL AND is_group_member(auth.uid(), lp.group_id))
        )
    )
  );
