ALTER TABLE public.diner_visits
ADD COLUMN spend_excl_tax numeric DEFAULT 0,
ADD COLUMN points_awarded numeric DEFAULT 0;