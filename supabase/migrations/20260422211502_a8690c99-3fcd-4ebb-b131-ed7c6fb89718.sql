ALTER TABLE public.loyalty_programs
  ADD COLUMN IF NOT EXISTS is_ordrup_builtin BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_one_builtin_per_group
  ON public.loyalty_programs (group_id)
  WHERE is_ordrup_builtin = true AND group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_one_builtin_per_venue
  ON public.loyalty_programs (venue_id)
  WHERE is_ordrup_builtin = true AND venue_id IS NOT NULL;