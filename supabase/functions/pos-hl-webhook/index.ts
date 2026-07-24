// Public webhook receiver for H&L POS menu/schedule change events.
//
// URL pattern: /pos-hl-webhook/{our_location_id}
//   - {our_location_id} is the value we hand to H&L POS at onboarding; it maps
//     1:1 to venue_pos_integrations.location_id.
//
// Steps:
//   1. Resolve venue by our location_id
//   2. Read raw body + verify HMAC signature with adapter.shared_secret
//   3. Insert into pos_webhook_events (unique constraint dedupes retries)
//   4. Ack 200 immediately
//   5. Enqueue jobs_pos_outbound { kind: "menu_pull", venue_id } so the menu
//      worker re-pulls in the background
//
// Public function: verify_jwt = false (H&L POS calls us directly, not via JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hlExceedVerifySignature } from "../adapters/hl_exceed/index.ts";
import { enforceRateLimit, getClientIp } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hl-signature, x-signature, x-hl-event-id, x-hl-topic",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = new URL(req.url);
  // /functions/v1/pos-hl-webhook/{location_id}
  const parts = url.pathname.split("/").filter(Boolean);
  const ourLocationId = parts[parts.length - 1];
  if (!ourLocationId || ourLocationId === "pos-hl-webhook") {
    return json(400, { error: "Missing location id in path" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: integ } = await supabase
    .from("venue_pos_integrations")
    .select("venue_id, pos_provider, secrets_map")
    .eq("pos_provider", "hl_exceed")
    .eq("location_id", ourLocationId)
    .maybeSingle();

  if (!integ) return json(404, { error: "No H&L integration for this location" });

  // AEA-02/AEA-07: bound unauthenticated flooding — each request triggers a
  // Vault read + HMAC compute, so cap it per location and per IP before that work.
  const ip = getClientIp(req);
  const rl = await enforceRateLimit(supabase, [
    { key: `pos-hl-webhook:loc:${ourLocationId}`, limit: 120, windowSec: 60 },
    { key: `pos-hl-webhook:ip:${ip}`, limit: 60, windowSec: 60 },
  ]);
  if (!rl.allowed) return json(429, { error: "Too many requests" });

  const rawBody = await req.text();
  const topic = req.headers.get("x-hl-topic") ?? "unknown";

  // Resolve shared_secret from Vault
  const { data: secret } = await supabase.rpc("read_pos_credential", {
    _venue_id: integ.venue_id, _field: "shared_secret",
  });
  const sharedSecret = typeof secret === "string" ? secret : "";

  const providedSig = (req.headers.get("x-hl-signature") ?? req.headers.get("x-signature") ?? "").trim();
  const sigValid = await hlExceedVerifySignature(sharedSecret, rawBody, providedSig);

  // AEA-07: verify the signature BEFORE writing anything. Previously the event
  // row was inserted first (even when the signature was invalid), which let an
  // unauthenticated caller pollute pos_webhook_events and — by supplying an
  // x-hl-event-id — pin a chosen event id so a later legitimate event with that
  // id would be silently deduped away (denial-of-processing).
  if (!sigValid) return json(401, { error: "Invalid signature" });

  // AEA-07: derive the dedupe key from the (now verified) signature rather than
  // the caller-supplied event-id header, and never fall back to a random UUID
  // (which defeated dedupe on legitimate retries).
  const dedupeKey = providedSig;

  let payload: unknown = null;
  try { payload = JSON.parse(rawBody); } catch { payload = { _raw: rawBody.slice(0, 4000) }; }

  const { error: insertErr } = await supabase.from("pos_webhook_events").insert({
    venue_id: integ.venue_id,
    provider_slug: "hl_exceed",
    event_id: dedupeKey,
    topic,
    signature_valid: true,
    raw: payload as any,
  });

  // Duplicate → this event was already processed; ack idempotently without
  // re-enqueuing another menu pull.
  if (insertErr) {
    if (String(insertErr.message).includes("duplicate")) {
      return json(200, { ok: true, deduped: true });
    }
    return json(500, { error: "Internal error" });
  }

  await supabase.from("venue_pos_integrations").update({
    last_webhook_at: new Date().toISOString(),
  }).eq("venue_id", integ.venue_id);

  // Enqueue a menu re-pull so we refresh in the background
  await supabase.rpc("enqueue_pos_job", {
    _payload: { kind: "menu_pull", venue_id: integ.venue_id, trigger: "webhook", topic },
  });

  // Spec §7: ack quickly
  return json(200, { ok: true, event_id: dedupeKey });
});
