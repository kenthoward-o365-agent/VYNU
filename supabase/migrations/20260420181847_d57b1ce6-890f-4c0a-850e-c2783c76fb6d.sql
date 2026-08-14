ALTER TABLE public.modifier_categories
  ADD COLUMN IF NOT EXISTS min_selection integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_selection integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selection_type text NOT NULL DEFAULT 'addon',
  ADD COLUMN IF NOT EXISTS show_on_receipt_when_free boolean NOT NULL DEFAULT false;

ALTER TABLE public.modifier_categories
  DROP CONSTRAINT IF EXISTS modifier_categories_selection_type_check;

ALTER TABLE public.modifier_categories
  ADD CONSTRAINT modifier_categories_selection_type_check
  CHECK (selection_type IN ('addon','removal','choice'));

ALTER TABLE public.modifier_categories
  DROP CONSTRAINT IF EXISTS modifier_categories_min_max_check;

ALTER TABLE public.modifier_categories
  ADD CONSTRAINT modifier_categories_min_max_check
  CHECK (min_selection >= 0 AND max_selection >= 0 AND (max_selection = 0 OR max_selection >= min_selection));