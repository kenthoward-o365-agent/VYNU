// Adapter contract used by generic pos-* edge functions to dispatch to a
// specific vendor implementation. Adapters are LAZY-LOADED by slug to keep
// edge function cold starts fast as the registry grows to N providers.

/**
 * A failure caused by our own data or payload rather than by the POS being
 * unreachable — an unset venue identifier, a rejected order body, a 4xx.
 *
 * The circuit breaker exists to stop hammering a POS that is down. Counting
 * these against it conflated "this one order is malformed" with "Exceed is
 * offline": five bad orders tripped the breaker, flipped connection_status to
 * 'error', and took the whole venue's integration down over a data problem that
 * retrying could never fix. runWithBreaker lets these through without touching
 * breaker state.
 */
export class PosDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosDataError";
  }
}

/** A line we could not address to a real POS product. */
export interface UnmappedLine {
  where: string;        // e.g. "sale_items[0]" — mirrors H&L's own validation paths
  description: string;  // human label so an operator can find the item
  posId: unknown;       // what we actually had, for diagnosis
}

export interface PosAdapterContext {
  venueId: string;
  config: Record<string, unknown>;        // non-secret venue config (location_id, etc.)
  secrets: Record<string, string>;        // secret values resolved from Vault
  endpointUrl?: string | null;
  tokenCache?: Record<string, unknown> | null;
}

export interface PosOrderUpdate {
  externalOrderId: string;
  status: string;
  updatedAt: string;
  raw?: unknown;
}

// Normalised menu snapshot returned by pullMenu(). Adapters convert their
// vendor-specific shape into this so pos-menu-pull can upsert generically.
export interface NormalisedMenu {
  categories: Array<{ pos_id: string; name: string; display_order?: number }>;
  items: Array<{
    pos_id: string;                 // PLU / vendor product id
    name: string;
    description?: string | null;
    price: number;                  // dollars
    category_pos_id?: string | null;
    is_available?: boolean;
    dietary_tags?: string[];
    allergens?: string[];
  }>;
  modifierGroups?: Array<{
    pos_id: string;
    name: string;
    min_selection?: number;
    max_selection?: number;
    options: Array<{ pos_id: string; name: string; price: number }>;
  }>;
}

// Order payload passed to sendOrder(). Adapters translate to vendor format.
export interface OutboundOrder {
  orderId: string;                  // our internal order id
  tableExternalId?: string | null;  // POS table identifier
  diner?: { name?: string | null; memberRef?: string | null } | null;
  lineItems: Array<{
    posId: string;                  // PLU on the POS
    quantity: number;
    unitPrice: number;
    notes?: string | null;
    modifiers?: Array<{ posId: string; quantity: number; unitPrice: number }>;
  }>;
  serviceCharges?: Array<{ posId: string; amount: number; label?: string }>;
  payment?: {
    method: string;
    amount: number;
    posPlu?: string | null;
    reference?: string | null;
  } | null;
  totals: { subtotal: number; tax: number; total: number; tip?: number };
}

export interface PosAdapter {
  slug: string;
  authenticate(ctx: PosAdapterContext): Promise<{ token: string; expiresAt: number }>;
  pushMenu?(ctx: PosAdapterContext, menu: unknown): Promise<{ ok: true } | { ok: false; error: string }>;
  pullMenu?(ctx: PosAdapterContext): Promise<NormalisedMenu>;
  pullOrders?(ctx: PosAdapterContext, sinceIso: string): Promise<PosOrderUpdate[]>;
  updateOrderStatus?(ctx: PosAdapterContext, externalOrderId: string, status: string): Promise<void>;
  snoozeProduct?(ctx: PosAdapterContext, plu: string, snoozeUntilIso: string | null): Promise<void>;
  // `unmapped` is non-empty when the order was sent with placeholder PLUs. The
  // push still succeeded; the caller is responsible for flagging it so the
  // substitution is never silent.
  sendOrder?(ctx: PosAdapterContext, order: OutboundOrder): Promise<{ posOrderId: string; accepted: boolean; raw?: unknown; unmapped?: UnmappedLine[] }>;
  // Verify an inbound webhook signature. Receives raw bytes + headers.
  verifyWebhook?(ctx: PosAdapterContext, headers: Headers, rawBody: string): boolean;
  testConnection(ctx: PosAdapterContext): Promise<{ ok: boolean; message: string }>;
}

// Whitelisted slugs; prevents arbitrary path imports.
const KNOWN: Record<string, () => Promise<{ default: PosAdapter }>> = {
  hl_exceed:  () => import("../adapters/hl_exceed/index.ts"),
  doshii:     () => import("../adapters/doshii/index.ts"),
  square:     () => import("../adapters/square/index.ts"),
  lightspeed: () => import("../adapters/lightspeed/index.ts"),
  mock:       () => import("../adapters/mock/index.ts"),
};

const cache = new Map<string, PosAdapter>();

export async function loadAdapter(slug: string): Promise<PosAdapter | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  const loader = KNOWN[slug];
  if (!loader) return null;
  const mod = await loader();
  cache.set(slug, mod.default);
  return mod.default;
}

export function listAdapterSlugs(): string[] {
  return Object.keys(KNOWN);
}
