// Adapter contract used by generic pos-* edge functions to dispatch to a
// specific vendor implementation. Adapters are LAZY-LOADED by slug to keep
// edge function cold starts fast as the registry grows to N providers.

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

export interface PosAdapter {
  slug: string;
  authenticate(ctx: PosAdapterContext): Promise<{ token: string; expiresAt: number }>;
  pushMenu?(ctx: PosAdapterContext, menu: unknown): Promise<{ ok: true } | { ok: false; error: string }>;
  pullOrders?(ctx: PosAdapterContext, sinceIso: string): Promise<PosOrderUpdate[]>;
  updateOrderStatus?(ctx: PosAdapterContext, externalOrderId: string, status: string): Promise<void>;
  snoozeProduct?(ctx: PosAdapterContext, plu: string, snoozeUntilIso: string | null): Promise<void>;
  testConnection(ctx: PosAdapterContext): Promise<{ ok: boolean; message: string }>;
}

// Whitelisted slugs; prevents arbitrary path imports.
const KNOWN: Record<string, () => Promise<{ default: PosAdapter }>> = {
  doshii: () => import("../adapters/doshii/index.ts"),
  mock:   () => import("../adapters/mock/index.ts"),
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
