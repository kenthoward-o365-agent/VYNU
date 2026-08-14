CREATE OR REPLACE FUNCTION public.get_menu_snapshot(
  _venue_id uuid,
  _table_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'venue', (
      SELECT to_jsonb(v) - 'created_at' - 'updated_at'
      FROM public.venues v
      WHERE v.id = _venue_id
    ),
    'table', (
      SELECT jsonb_build_object('id', t.id, 'table_number', t.table_number)
      FROM public.tables t
      WHERE t.venue_id = _venue_id
        AND _table_id IS NOT NULL
        AND (
          (t.id::text = _table_id)
          OR (t.table_number = _table_id)
        )
      LIMIT 1
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', mi.id,
        'name', mi.name,
        'description', mi.description,
        'price', mi.price,
        'image_url', mi.image_url,
        'dietary_tags', mi.dietary_tags,
        'allergens', mi.allergens,
        'is_available', mi.is_available,
        'category_id', mi.category_id,
        'display_order', mi.display_order
      ) ORDER BY mi.display_order)
      FROM public.menu_items mi
      WHERE mi.venue_id = _venue_id
        AND mi.is_available = true
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'display_order', c.display_order
      ) ORDER BY c.display_order)
      FROM public.menu_categories c
      WHERE c.venue_id = _venue_id
        AND c.is_active = true
    ), '[]'::jsonb),
    'pricing', jsonb_build_object(
      'rules', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
        FROM public.pricing_rules r
        WHERE r.venue_id = _venue_id
          AND r.is_active = true
      ), '[]'::jsonb),
      'links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'pricing_rule_id', l.pricing_rule_id,
          'menu_item_id', l.menu_item_id
        ))
        FROM public.pricing_rule_items l
        JOIN public.pricing_rules r ON r.id = l.pricing_rule_id
        WHERE r.venue_id = _venue_id
          AND r.is_active = true
      ), '[]'::jsonb)
    ),
    'ai', (
      SELECT jsonb_build_object(
        'chat_mode', a.chat_mode,
        'agent_name', a.agent_name,
        'agent_icon_url', a.agent_icon_url
      )
      FROM public.venue_ai_config a
      WHERE a.venue_id = _venue_id
      LIMIT 1
    ),
    'generated_at', now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_menu_snapshot(uuid, text) TO anon, authenticated, service_role;