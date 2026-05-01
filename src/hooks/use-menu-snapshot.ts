import { useQuery } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface MenuSnapshotItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  dietary_tags: string[] | null;
  allergens: string[] | null;
  is_available: boolean | null;
  category_id: string | null;
  display_order?: number | null;
}

export interface MenuSnapshotCategory {
  id: string;
  name: string;
  display_order?: number | null;
}

export interface MenuSnapshot {
  venue: {
    id: string;
    name: string;
    venue_type: string;
    logo_url: string | null;
    landing_page_html: string | null;
    settings: Record<string, any> | null;
    city: string | null;
    state: string | null;
    country?: string | null;
    is_active?: boolean | null;
  } | null;
  table: { id: string; table_number: string } | null;
  items: MenuSnapshotItem[];
  categories: MenuSnapshotCategory[];
  pricing: {
    rules: any[];
    links: { pricing_rule_id: string; menu_item_id: string }[];
  };
  ai: { chat_mode: string | null; agent_name: string | null; agent_icon_url: string | null } | null;
  generated_at: string;
}

async function fetchMenuSnapshot(venueId: string, tableId?: string | null): Promise<MenuSnapshot> {
  const params = new URLSearchParams({ venueId });
  if (tableId) params.set("tableId", tableId);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/menu-snapshot?${params}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`menu-snapshot failed: ${res.status}`);
  }
  return (await res.json()) as MenuSnapshot;
}

/**
 * Edge-cached menu snapshot for the consumer ordering flow.
 * Replaces ~6 serial Supabase round-trips with ONE cached HTTP call.
 *
 * Cache layers:
 *  - Edge/CDN: 30s public + 5min stale-while-revalidate
 *  - React Query: staleTime 60s (won't refetch unless invalidated)
 */
export function useMenuSnapshot(venueId?: string | null, tableId?: string | null) {
  return useQuery({
    queryKey: ["menu-snapshot", venueId, tableId],
    queryFn: () => fetchMenuSnapshot(venueId!, tableId),
    enabled: !!venueId,
    staleTime: 60_000,
  });
}
