// Manager-only: manually enqueue a single order to be pushed to the venue's POS.
// Mirrors what the auto-push trigger does, but works regardless of the venue
// auto_push_orders flag and from a button click.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Missing bearer" });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const body = await req.json().catch(() => ({}));
  const venueId = String(body.venue_id ?? "");
  const orderId = String(body.order_id ?? "");
  // The worker refuses to push an order that already carries a pos_order_id —
  // that is what stops a redelivered job creating a second docket in Exceed.
  // `force` is the operator's explicit override, set only when the UI has
  // warned them that re-pushing a delivered order can duplicate it.
  const force = body.force === true;
  if (!venueId || !orderId) return json(400, { error: "venue_id and order_id required" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: isManager } = await admin.rpc("is_venue_manager", {
    _user_id: user.id, _venue_id: venueId,
  });
  if (!isManager) return json(403, { error: "Not authorised" });


  // Validate order belongs to venue
  const { data: ord } = await admin.from("orders")
    .select("id, venue_id").eq("id", orderId).maybeSingle();
  if (!ord || ord.venue_id !== venueId) return json(404, { error: "Order not found" });

  const { data: msgId, error } = await admin.rpc("enqueue_pos_job", {
    _payload: { kind: "send_order", venue_id: venueId, order_id: orderId, force },
  });
  if (error) { console.error("[pos-order-push] enqueue failed", error); return json(500, { error: "Failed to enqueue order" }); }

  // Clear any stale claim so the worker can take this order straight away
  // rather than waiting out the claim TTL of an attempt that already died.
  await admin.from("orders").update({
    pos_push_status: "queued", pos_push_error: null, pos_push_claimed_at: null,
  } as any).eq("id", orderId);

  return json(200, { ok: true, msg_id: msgId });
});
