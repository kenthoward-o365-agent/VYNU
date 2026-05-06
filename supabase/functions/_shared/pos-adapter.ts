// Adapter contract used by generic pos-* edge functions to dispatch to a specific
// vendor implementation. Each provider exports an object satisfying PosAdapter.
//
// Lookup is performed via provider.slug (e.g. "doshii") on the venue's
// venue_pos_integrations row joined to pos_providers.

export interface PosAdapterContext {
  venueId: string;
  config: Record<string, unknown>;        // venue-specific config (location_id, etc.)
  clientId?: string | null;
  clientSecretRef?: string | null;
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

// Dynamic registry — adapters self-register on import.
const registry = new Map<string, PosAdapter>();

export function registerAdapter(adapter: PosAdapter) {
  registry.set(adapter.slug, adapter);
}

export function getAdapter(slug: string): PosAdapter | null {
  return registry.get(slug) ?? null;
}

// Eagerly import all known adapters so they self-register.
import "../adapters/doshii/index.ts";
import "../adapters/mock/index.ts";
