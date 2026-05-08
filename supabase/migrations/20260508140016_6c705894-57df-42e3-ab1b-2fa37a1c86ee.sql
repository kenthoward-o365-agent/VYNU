DO $$
DECLARE
  loadtest_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO loadtest_ids FROM public.venues WHERE name LIKE 'LOADTEST_%';

  IF loadtest_ids IS NULL OR array_length(loadtest_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Order matters: child tables first
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.orders WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.table_sessions WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.tables WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.menu_item_modifiers WHERE menu_item_id IN (SELECT id FROM public.menu_items WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.menu_item_display_areas WHERE menu_item_id IN (SELECT id FROM public.menu_items WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.menu_item_time_frames WHERE menu_item_id IN (SELECT id FROM public.menu_items WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.menu_items WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.menu_category_display_areas WHERE category_id IN (SELECT id FROM public.menu_categories WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.menu_categories WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.modifier_categories WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.menu_time_frames WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.diner_visits WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.diner_web_sessions WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.diner_stored_cards WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.chat_messages_log WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.chat_sessions WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.display_terminal_areas WHERE terminal_id IN (SELECT id FROM public.display_terminals WHERE venue_id = ANY(loadtest_ids));
  DELETE FROM public.display_terminals WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.loyalty_program_venue_optouts WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.loyalty_programs WHERE venue_id = ANY(loadtest_ids);

  DELETE FROM public.api_webhooks WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.api_keys WHERE venue_id = ANY(loadtest_ids);
  DELETE FROM public.api_request_log WHERE venue_id = ANY(loadtest_ids);

  -- Finally venues themselves
  DELETE FROM public.venues WHERE id = ANY(loadtest_ids);
END $$;