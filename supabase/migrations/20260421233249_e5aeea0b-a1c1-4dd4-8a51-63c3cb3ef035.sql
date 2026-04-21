
-- 1. Opt-out table: child venue opts out of parent group's loyalty program
CREATE TABLE IF NOT EXISTS public.loyalty_program_venue_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (program_id, venue_id)
);

ALTER TABLE public.loyalty_program_venue_optouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view optouts for their venues"
  ON public.loyalty_program_venue_optouts
  FOR SELECT TO authenticated
  USING (is_venue_staff(auth.uid(), venue_id) OR has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Managers can insert optouts"
  ON public.loyalty_program_venue_optouts
  FOR INSERT TO authenticated
  WITH CHECK (is_venue_manager(auth.uid(), venue_id) OR has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Managers can delete optouts"
  ON public.loyalty_program_venue_optouts
  FOR DELETE TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id) OR has_role(auth.uid(), 'tabless_admin'::app_role));

-- 2. Resolver function: which loyalty program is "active" at a venue?
-- Priority: group program (if venue is in a group AND not opted out) > venue program
CREATE OR REPLACE FUNCTION public.get_active_loyalty_program(_venue_id uuid)
RETURNS SETOF public.loyalty_programs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT id, group_id FROM public.venues WHERE id = _venue_id
  ),
  group_prog AS (
    SELECT lp.*
    FROM public.loyalty_programs lp, v
    WHERE v.group_id IS NOT NULL
      AND lp.group_id = v.group_id
      AND lp.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_program_venue_optouts o
        WHERE o.program_id = lp.id AND o.venue_id = _venue_id
      )
    ORDER BY lp.created_at
    LIMIT 1
  ),
  venue_prog AS (
    SELECT lp.*
    FROM public.loyalty_programs lp
    WHERE lp.venue_id = _venue_id
      AND lp.is_active = true
    ORDER BY lp.created_at
    LIMIT 1
  )
  SELECT * FROM group_prog
  UNION ALL
  SELECT * FROM venue_prog WHERE NOT EXISTS (SELECT 1 FROM group_prog)
  LIMIT 1;
$$;

-- 3. Auto-provision trigger for new venues
CREATE OR REPLACE FUNCTION public.auto_provision_venue_ordrup_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_rules jsonb := jsonb_build_object(
    'earn_points_per_dollar', 1,
    'redeem_rate_cents_per_point', 5,
    'min_redeem_points', 100,
    'signup_bonus', 50,
    'scope', 'venue'
  );
BEGIN
  -- If venue belongs to a group, ensure a group program exists; do not create a venue-level one.
  IF NEW.group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.loyalty_programs
      WHERE group_id = NEW.group_id AND is_active = true
    ) THEN
      INSERT INTO public.loyalty_programs (name, group_id, venue_id, program_type, is_active, rules)
      SELECT (g.name || ' Rewards'), NEW.group_id, NULL, 'points'::loyalty_program_type, true,
             jsonb_set(default_rules, '{scope}', '"group"')
      FROM public.venue_groups g WHERE g.id = NEW.group_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Standalone venue: create venue-level program if none exists.
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_programs
    WHERE venue_id = NEW.id AND is_active = true
  ) THEN
    INSERT INTO public.loyalty_programs (name, venue_id, program_type, is_active, rules)
    VALUES (NEW.name || ' Rewards', NEW.id, 'points'::loyalty_program_type, true, default_rules);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_provision_venue_rewards ON public.venues;
CREATE TRIGGER trg_auto_provision_venue_rewards
  AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.auto_provision_venue_ordrup_rewards();

-- 4. Auto-provision trigger for new groups
CREATE OR REPLACE FUNCTION public.auto_provision_group_ordrup_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_rules jsonb := jsonb_build_object(
    'earn_points_per_dollar', 1,
    'redeem_rate_cents_per_point', 5,
    'min_redeem_points', 100,
    'signup_bonus', 50,
    'scope', 'group'
  );
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_programs
    WHERE group_id = NEW.id AND is_active = true
  ) THEN
    INSERT INTO public.loyalty_programs (name, group_id, program_type, is_active, rules)
    VALUES (NEW.name || ' Rewards', NEW.id, 'points'::loyalty_program_type, true, default_rules);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_provision_group_rewards ON public.venue_groups;
CREATE TRIGGER trg_auto_provision_group_rewards
  AFTER INSERT ON public.venue_groups
  FOR EACH ROW EXECUTE FUNCTION public.auto_provision_group_ordrup_rewards();

-- 5. Balance migration helper: merge balances from one program into another
CREATE OR REPLACE FUNCTION public.migrate_loyalty_balances_to_program(
  _from_program uuid,
  _to_program uuid,
  _deactivate_source boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.loyalty_programs%ROWTYPE;
  migrated_count int := 0;
  caller_can_manage boolean;
BEGIN
  SELECT * INTO src FROM public.loyalty_programs WHERE id = _from_program;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source program not found';
  END IF;

  -- Authorisation: caller must be an admin or a manager of the source program scope.
  caller_can_manage := has_role(auth.uid(), 'tabless_admin'::app_role)
    OR (src.venue_id IS NOT NULL AND is_venue_manager(auth.uid(), src.venue_id))
    OR (src.group_id IS NOT NULL AND is_group_admin(auth.uid(), src.group_id));
  IF NOT caller_can_manage THEN
    RAISE EXCEPTION 'Not authorised to migrate balances from this program';
  END IF;

  -- Merge: for each diner balance in source, upsert into target.
  WITH src_bal AS (
    SELECT diner_id, balance FROM public.loyalty_balances WHERE program_id = _from_program
  ),
  upserted AS (
    INSERT INTO public.loyalty_balances (diner_id, program_id, balance)
    SELECT diner_id, _to_program, balance FROM src_bal
    ON CONFLICT (diner_id, program_id) DO UPDATE
      SET balance = public.loyalty_balances.balance + EXCLUDED.balance,
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO migrated_count FROM upserted;

  IF _deactivate_source THEN
    UPDATE public.loyalty_programs SET is_active = false, updated_at = now() WHERE id = _from_program;
  END IF;

  RETURN jsonb_build_object('migrated_diners', migrated_count, 'source_deactivated', _deactivate_source);
END;
$$;

-- 6. Ensure (diner_id, program_id) uniqueness for upsert above to work
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_balances_diner_program_unique'
  ) THEN
    ALTER TABLE public.loyalty_balances
      ADD CONSTRAINT loyalty_balances_diner_program_unique UNIQUE (diner_id, program_id);
  END IF;
END $$;
