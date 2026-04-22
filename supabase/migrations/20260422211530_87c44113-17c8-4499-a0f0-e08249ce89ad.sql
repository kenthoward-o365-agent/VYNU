DROP FUNCTION IF EXISTS public.get_active_loyalty_program(uuid);

CREATE OR REPLACE FUNCTION public.get_active_loyalty_program(p_venue_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  rules jsonb,
  program_type public.loyalty_program_type,
  group_id uuid,
  venue_id uuid,
  is_ordrup_builtin boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT id, group_id FROM public.venues WHERE id = p_venue_id
  ),
  candidates AS (
    SELECT 1 AS priority, lp.id, lp.name, lp.rules, lp.program_type, lp.group_id, lp.venue_id, lp.is_ordrup_builtin, lp.updated_at
    FROM public.loyalty_programs lp
    JOIN v ON v.group_id = lp.group_id
    WHERE lp.is_active = true
      AND lp.is_ordrup_builtin = true
      AND lp.group_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_program_venue_optouts o
        WHERE o.program_id = lp.id AND o.venue_id = p_venue_id
      )
    UNION ALL
    SELECT 2, lp.id, lp.name, lp.rules, lp.program_type, lp.group_id, lp.venue_id, lp.is_ordrup_builtin, lp.updated_at
    FROM public.loyalty_programs lp
    JOIN v ON v.group_id = lp.group_id
    WHERE lp.is_active = true
      AND lp.is_ordrup_builtin = false
      AND lp.group_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_program_venue_optouts o
        WHERE o.program_id = lp.id AND o.venue_id = p_venue_id
      )
    UNION ALL
    SELECT 3, lp.id, lp.name, lp.rules, lp.program_type, lp.group_id, lp.venue_id, lp.is_ordrup_builtin, lp.updated_at
    FROM public.loyalty_programs lp
    WHERE lp.is_active = true
      AND lp.is_ordrup_builtin = true
      AND lp.venue_id = p_venue_id
    UNION ALL
    SELECT 4, lp.id, lp.name, lp.rules, lp.program_type, lp.group_id, lp.venue_id, lp.is_ordrup_builtin, lp.updated_at
    FROM public.loyalty_programs lp
    WHERE lp.is_active = true
      AND lp.is_ordrup_builtin = false
      AND lp.venue_id = p_venue_id
  )
  SELECT id, name, rules, program_type, group_id, venue_id, is_ordrup_builtin
  FROM candidates
  ORDER BY priority ASC, updated_at DESC
  LIMIT 1;
$$;