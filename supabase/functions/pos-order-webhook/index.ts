import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature",
};

// H&L OrderNOW API status codes → our order_status enum
const STATUS_MAP: Record<number, string> = {
  1: "received",
  2: "preparing",
  3: "ready",
  4: "served",
  5: "paid",
  6: "cancelled",
  7: "cancelled", // rejected maps to cancelled
};

async function verifyHmac(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

async function getAuthToken(supabase: any, venueId: string): Promise<string | null> {
  // Call pos-auth function internally
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supabaseUrl}/functions/v1/pos-auth`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ venue_id: venueId }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Determine if this is an inbound status update or outbound order push
    if (body.action === "status_update") {
      // INBOUND: POS sending us an order status update
      const { orderId, statusCode, locationId } = body;

      if (!orderId || !statusCode) {
        return new Response(
          JSON.stringify({ error: "orderId and statusCode required" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // REQUIRE HMAC signature + locationId on every inbound status update.
      const signature = req.headers.get("x-signature");
      if (!signature || !locationId) {
        return new Response(
          JSON.stringify({ error: "Signature and locationId required" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const { data: integration } = await supabase
        .from("venue_pos_integrations")
        .select("venue_id")
        .eq("location_id", locationId)
        .single();

      const { data: secretRow } = integration
        ? await supabase.rpc("get_pos_webhook_secret", { _venue_id: integration.venue_id })
        : { data: null as any };

      const webhookSecret: string | null = (secretRow as any) ?? null;
      if (!webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Integration not configured" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const valid = await verifyHmac(webhookSecret, rawBody, signature);
      if (!valid) {
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const newStatus = STATUS_MAP[statusCode];
      if (!newStatus) {
        return new Response(
          JSON.stringify({ error: `Unknown status code: ${statusCode}` }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Update order status — scoped to the venue that owns this POS integration
      // to prevent cross-venue order manipulation via a valid POS credential.
      const { error: updateErr, count: updatedCount } = await supabase
        .from("orders")
        .update({ status: newStatus }, { count: "exact" })
        .eq("id", orderId)
        .eq("venue_id", integration.venue_id);

      if (!updateErr && (updatedCount ?? 0) === 0) {
        return new Response(
          JSON.stringify({ error: "Order not found for this venue" }),
          { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: updateErr.message }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Log
      await supabase.from("pos_sync_log").insert({
        venue_id:
          (
            await supabase
              .from("orders")
              .select("venue_id")
              .eq("id", orderId)
              .single()
          ).data?.venue_id || "00000000-0000-0000-0000-000000000000",
        event_type: "order_status_update",
        direction: "inbound",
        result: "success",
        items_synced: 0,
      });

      return new Response(
        JSON.stringify({ success: true, orderId, newStatus }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "push_order") {
      // OUTBOUND: Push an order to the POS system. Require service-role auth.
      const authHeader = req.headers.get("authorization") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== serviceKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorised" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const { order_id } = body;

      if (!order_id) {
        return new Response(
          JSON.stringify({ error: "order_id required" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Fetch order with items
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("*, order_items(*, menu_items(name, plu, pos_id))")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Fetch integration
      const { data: integration } = await supabase
        .from("venue_pos_integrations")
        .select("*")
        .eq("venue_id", order.venue_id)
        .single();

      if (!integration?.endpoint_url || !integration?.location_id) {
        return new Response(
          JSON.stringify({ error: "POS integration not configured" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Get auth token
      const token = await getAuthToken(supabase, order.venue_id);
      if (!token) {
        return new Response(
          JSON.stringify({ error: "Failed to get auth token" }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Format order per H&L OrderNOW API spec
      const posOrder = {
        orderId: order.id,
        locationId: integration.location_id,
        items: (order.order_items || []).map((item: any) => ({
          plu: item.menu_items?.plu || item.menu_items?.pos_id || "",
          name: item.menu_items?.name || "",
          quantity: item.quantity,
          unitPrice: item.unit_price,
          modifiers: item.modifiers || [],
          notes: item.notes || "",
        })),
        tableNumber: order.table_id || null,
        customerNotes: order.customer_notes || "",
        total: order.total,
        createdAt: order.created_at,
      };

      // POST to POS
      const posRes = await fetch(
        `${integration.endpoint_url}/pos/${integration.location_id}/orders`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(posOrder),
        }
      );

      const posResult = await posRes.json().catch(() => ({}));

      // Log
      await supabase.from("pos_sync_log").insert({
        venue_id: order.venue_id,
        event_type: "order_push",
        direction: "outbound",
        result: posRes.ok ? "success" : "error",
        error_message: posRes.ok ? null : JSON.stringify(posResult),
        items_synced: order.order_items?.length || 0,
      });

      if (!posRes.ok) {
        return new Response(
          JSON.stringify({ error: "POS rejected order", details: posResult }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, posResponse: posResult }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'status_update' or 'push_order'" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
