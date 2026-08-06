// Manager-only: send a test order to H&L Web Orders sandbox/live.
// Forces test:true header, $0.01 PLU 1, fast-tender.
// Returns full request/response so the operator UI can show what was sent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadIntegration, buildContext } from "../_shared/pos-context.ts";
import { mapOutboundOrder, postOrder } from "../_shared/hl-weborders-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing bearer" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const body = await req.json().catch(() => ({}));
  const venueId = String(body.venue_id ?? "");
  if (!venueId) return json(400, { error: "venue_id required" });

  const { data: isManager } = await supabase.rpc("is_venue_manager", {
    _user_id: user.id, _venue_id: venueId,
  });
  if (!isManager) return json(403, { error: "Not authorised" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const integ = await loadIntegration(admin, venueId);
  if (!integ || integ.pos_providers?.slug !== "hl_exceed") {
    return json(404, { error: "No H&L integration for this venue" });
  }
  const ctx = await buildContext(admin, integ);
  // Force test mode for safety.
  ctx.config = { ...ctx.config, test_mode: true };

  const reference = crypto.randomUUID();
  // mapOutboundOrder throws when the venue is missing integrator/recipient/station ids.
  // Catch it here so the operator gets that message instead of an opaque 500.
  let mapped: ReturnType<typeof mapOutboundOrder>;
  try {
    mapped = mapOutboundOrder({
      orderId: reference,
      tableExternalId: null,
      diner: { name: "Test Diner", memberRef: "" },
      lineItems: [{ posId: "1", quantity: 1, unitPrice: 0.01, notes: "Tab-Less test order" }],
      totals: { subtotal: 0.01, tax: 0, total: 0.01 },
      payment: { method: "card", amount: 0.01 },
    }, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("pos_sync_log").insert({
      venue_id: venueId, event_type: "test_order",
      direction: "outbound", result: "error", error_message: msg,
    });
    return json(400, { ok: false, error: msg });
  }

  try {
    const res = await postOrder(admin, ctx, mapped.payload);
    await admin.from("pos_sync_log").insert({
      venue_id: venueId, event_type: "test_order",
      direction: "outbound", result: "success",
    });
    return json(200, {
      ok: true, request: mapped.payload, response: res, unmapped: mapped.unmapped,
    });
  } catch (err) {
    const msg = (err as Error).message;
    await admin.from("pos_sync_log").insert({
      venue_id: venueId, event_type: "test_order",
      direction: "outbound", result: "error", error_message: msg,
    });
    return json(200, { ok: false, request: mapped.payload, error: msg });
  }
});
