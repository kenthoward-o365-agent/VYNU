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
  if (!venueId || !orderId) return json(400, { error: "venue_id and order_id required" });

  const { data: isManager } = await userClient.rpc("is_venue_manager", {
    _user_id: user.id, _venue_id: venueId,
  });
  if (!isManager) return json(403, { error: "Not authorised" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate order belongs to venue
  const { data: ord } = await admin.from("orders")
    .select("id, venue_id").eq("id", orderId).maybeSingle();
  if (!ord || ord.venue_id !== venueId) return json(404, { error: "Order not found" });

  const { data: msgId, error } = await admin.rpc("enqueue_pos_job", {
    _payload: { kind: "send_order", venue_id: venueId, order_id: orderId },
  });
  if (error) { console.error("[pos-order-push] enqueue failed", error); return json(500, { error: "Failed to enqueue order" }); }

  await admin.from("orders").update({
    pos_push_status: "queued", pos_push_error: null,
  } as any).eq("id", orderId);

  return json(200, { ok: true, msg_id: msgId });
});
