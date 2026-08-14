ALTER TABLE public.modifiers ADD COLUMN pos_id text;
ALTER TABLE public.modifiers ADD COLUMN plu text;
ALTER TABLE public.modifier_categories ADD COLUMN pos_id text;
ALTER TABLE public.orders ADD COLUMN pos_order_id text;
ALTER TABLE public.tables ADD COLUMN pos_table_id text;