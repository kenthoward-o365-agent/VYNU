
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_items_venue_pos_id
  ON public.menu_items (venue_id, pos_id) WHERE pos_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_categories_venue_pos_id
  ON public.menu_categories (venue_id, pos_id) WHERE pos_id IS NOT NULL;
