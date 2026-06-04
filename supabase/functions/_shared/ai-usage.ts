// Shared helper to log AI Gateway token usage + cost to ai_usage_log.
// Call after a successful chat-completions response.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

let _priceCache: Record<string, { in: number; out: number }> | null = null;
let _priceFetchedAt = 0;

async function loadPrices(admin: ReturnType<typeof createClient>) {
  const now = Date.now();
  if (_priceCache && now - _priceFetchedAt < 5 * 60_000) return _priceCache;
  const { data } = await admin.from("ai_model_prices").select("model,input_per_1k_usd,output_per_1k_usd");
  const map: Record<string, { in: number; out: number }> = {};
  for (const r of data || []) {
    map[r.model as string] = { in: Number(r.input_per_1k_usd), out: Number(r.output_per_1k_usd) };
  }
  _priceCache = map;
  _priceFetchedAt = now;
  return map;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export interface LogAiUsageInput {
  venueId: string;
  feature: string; // 'diner_chat' | 'upsell' | 'onboarding' | 'insights' | 'menu_import' | 'image_gen' | 'modifiers'
  model: string;
  usage?: Usage | null;
  requestId?: string | null;
  sessionId?: string | null;
  orderId?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    if (!input.venueId) return;
    const admin = adminClient();
    const prices = await loadPrices(admin);
    const p = prices[input.model] || { in: 0, out: 0 };
    const pt = Number(input.usage?.prompt_tokens || 0);
    const ct = Number(input.usage?.completion_tokens || 0);
    const cost = (pt / 1000) * p.in + (ct / 1000) * p.out;
    await admin.from("ai_usage_log").insert({
      venue_id: input.venueId,
      feature: input.feature,
      model: input.model,
      prompt_tokens: pt,
      completion_tokens: ct,
      cost_usd: Number(cost.toFixed(6)),
      request_id: input.requestId || null,
      session_id: input.sessionId || null,
      order_id: input.orderId || null,
      meta: input.meta || null,
    });
  } catch (e) {
    console.error("[ai-usage] log failed:", e);
  }
}

// Helper for image gen where cost is per-image (stored in output_per_1k_usd as per-call price).
export async function logAiImageUsage(input: Omit<LogAiUsageInput, "usage"> & { images?: number }) {
  const admin = adminClient();
  const prices = await loadPrices(admin);
  const p = prices[input.model] || { in: 0, out: 0 };
  const n = input.images ?? 1;
  const cost = p.out * n;
  try {
    await admin.from("ai_usage_log").insert({
      venue_id: input.venueId,
      feature: input.feature,
      model: input.model,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: Number(cost.toFixed(6)),
      request_id: input.requestId || null,
      session_id: input.sessionId || null,
      order_id: input.orderId || null,
      meta: { ...(input.meta || {}), images: n },
    });
  } catch (e) {
    console.error("[ai-usage] image log failed:", e);
  }
}
