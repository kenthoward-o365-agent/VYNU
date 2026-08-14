ALTER TABLE public.venues DROP COLUMN IF EXISTS white_label_brand_id;
DROP TABLE IF EXISTS public.white_label_brands CASCADE;