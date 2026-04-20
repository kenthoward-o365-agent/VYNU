-- Add display_order column to menu_item_modifiers for per-item category ordering
ALTER TABLE public.menu_item_modifiers
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill: assign display_order per menu_item_id based on existing created_at ordering
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY menu_item_id ORDER BY created_at) - 1 AS rn
  FROM public.menu_item_modifiers
)
UPDATE public.menu_item_modifiers mim
SET display_order = ordered.rn
FROM ordered
WHERE mim.id = ordered.id;

CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_item_order
ON public.menu_item_modifiers (menu_item_id, display_order);