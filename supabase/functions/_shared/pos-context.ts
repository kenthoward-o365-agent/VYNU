// Build a PosAdapterContext for a given venue, hydrating non-secret config
// from venue_pos_integrations and resolving secret values from Vault via
// the SECURITY DEFINER read_pos_credential() RPC.
//
// Also exposes circuit-breaker helpers so all outbound calls share one policy.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PosDataError } from "./pos-adapter.ts";
import type { PosAdapter, PosAdapterContext } from "./pos-adapter.ts";

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MINUTES = 5;

export interface IntegrationRow {
  venue_id: string;
  pos_provider: string;
  config: Record<string, unknown> | null;
  secrets_map: Record<string, string> | null;
  endpoint_url: string | null;
  token_cache: Record<string, unknown> | null;
  connection_status: string;
  breaker_state: string;
  breaker_failures: number;
  breaker_opened_at: string | null;
  pos_providers?: { slug: string; config_schema: Array<Record<string, unknown>> } | null;
}

export async function loadIntegration(supabase: SupabaseClient, venueId: string): Promise<IntegrationRow | null> {
  const { data } = await supabase
    .from("venue_pos_integrations")
    .select("venue_id, pos_provider, config, secrets_map, endpoint_url, token_cache, connection_status, breaker_state, breaker_failures, breaker_opened_at, pos_providers!inner(slug, config_schema)")
    .eq("venue_id", venueId)
    .maybeSingle();
  return (data as IntegrationRow | null) ?? null;
}

export async function buildContext(
  supabase: SupabaseClient,
  integ: IntegrationRow,
): Promise<PosAdapterContext> {
  const schema = integ.pos_providers?.config_schema ?? [];
  const secrets: Record<string, string> = {};
  const secretFields = schema
    .filter((f: any) => f?.type === "secret")
    .map((f: any) => String(f.key));

  for (const field of secretFields) {
    const { data } = await supabase.rpc("read_pos_credential", {
      _venue_id: integ.venue_id,
      _field: field,
    });
    if (typeof data === "string") secrets[field] = data;
  }

  return {
    venueId: integ.venue_id,
    config: integ.config ?? {},
    secrets,
    endpointUrl: integ.endpoint_url,
    tokenCache: integ.token_cache,
  };
}

// ---- Circuit breaker --------------------------------------------------

export function breakerAllows(integ: IntegrationRow): boolean {
  if (integ.breaker_state === "closed") return true;
  if (integ.breaker_state === "open") {
    const opened = integ.breaker_opened_at ? new Date(integ.breaker_opened_at).getTime() : 0;
    return Date.now() - opened > COOLDOWN_MINUTES * 60 * 1000;
  }
  return true; // half_open: try once
}

/**
 * Seconds until an open breaker lets the next call through (0 when it already
 * does). The outbound worker re-hides a deferred job for exactly this long
 * instead of retrying into a breaker that is guaranteed to reject it.
 */
export function breakerRetryAfterSeconds(integ: IntegrationRow): number {
  if (breakerAllows(integ)) return 0;
  const opened = integ.breaker_opened_at ? new Date(integ.breaker_opened_at).getTime() : 0;
  const readyAt = opened + COOLDOWN_MINUTES * 60 * 1000;
  return Math.max(1, Math.ceil((readyAt - Date.now()) / 1000));
}

export async function recordBreakerSuccess(supabase: SupabaseClient, venueId: string) {
  await supabase.from("venue_pos_integrations").update({
    breaker_state: "closed",
    breaker_failures: 0,
    breaker_opened_at: null,
    connection_status: "connected",
    last_error: null,
  }).eq("venue_id", venueId);
}

export async function recordBreakerFailure(supabase: SupabaseClient, venueId: string, err: string) {
  const { data: cur } = await supabase
    .from("venue_pos_integrations")
    .select("breaker_failures")
    .eq("venue_id", venueId)
    .maybeSingle();
  const failures = (cur?.breaker_failures ?? 0) + 1;
  const open = failures >= FAILURE_THRESHOLD;
  await supabase.from("venue_pos_integrations").update({
    breaker_failures: failures,
    breaker_state: open ? "open" : "closed",
    breaker_opened_at: open ? new Date().toISOString() : null,
    connection_status: open ? "error" : "connecting",
    last_error: err.slice(0, 500),
  }).eq("venue_id", venueId);
}

export type BreakerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; tripped: boolean; dataError: boolean };

export async function runWithBreaker<T>(
  supabase: SupabaseClient,
  integ: IntegrationRow,
  fn: () => Promise<T>,
): Promise<BreakerResult<T>> {
  if (!breakerAllows(integ)) {
    return {
      ok: false,
      error: `Circuit open for ${integ.pos_provider}`,
      tripped: true,
      dataError: false,
    };
  }
  try {
    const value = await fn();
    await recordBreakerSuccess(supabase, integ.venue_id);
    return { ok: true, value };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // A bad payload says nothing about whether the POS is reachable. Counting
    // these tripped the breaker and flipped connection_status to 'error' over a
    // data problem — taking the venue's whole integration down. (Previously the
    // settings UI also hid recovery controls when status !== 'connected', making
    // it harder to recover.) Job-level retry/DLQ still applies; only breaker state is untouched.
    if (err instanceof PosDataError) {
      return { ok: false, error: msg, tripped: false, dataError: true };
    }
    await recordBreakerFailure(supabase, integ.venue_id, msg);
    return { ok: false, error: msg, tripped: false, dataError: false };
  }
}

export type Adapter = PosAdapter;
