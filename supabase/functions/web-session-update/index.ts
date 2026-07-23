// Consolidated diner web-session update endpoint.
// Anonymous clients cannot UPDATE diner_web_sessions directly (RLS),
// so all activity/funnel marker updates flow through this function
// which uses the service role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set([
  "ping",
  "end",
  "add_to_cart",
  "checkout",
  "order_placed",
]);
const ALLOWED_END_REASONS = new Set([
  "tab_closed",
  "manual_close",
  "idle_timeout",
  "ordered",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const session_id = String(body?.session_id ?? "");
    const action = String(body?.action ?? "");
    if (!UUID_RE.test(session_id)) return json({ error: "invalid session_id" }, 400);
    if (!ALLOWED_ACTIONS.has(action)) return json({ error: "invalid action" }, 400);

    if (action === "ping") {
      await supabase
        .from("diner_web_sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", session_id)
        .is("ended_at", null);
      return json({ ok: true });
    }

    if (action === "end") {
      const end_reason = String(body?.end_reason ?? "manual_close");
      if (!ALLOWED_END_REASONS.has(end_reason)) return json({ error: "invalid end_reason" }, 400);
      await supabase
        .from("diner_web_sessions")
        .update({ ended_at: new Date().toISOString(), end_reason })
        .eq("id", session_id)
        .is("ended_at", null);
      return json({ ok: true });
    }

    if (action === "checkout") {
      await supabase
        .from("diner_web_sessions")
        .update({ reached_checkout_at: new Date().toISOString() })
        .eq("id", session_id)
        .is("reached_checkout_at", null);
      return json({ ok: true });
    }

    if (action === "add_to_cart") {
      const cartValueCents = Number.isFinite(body?.cart_value_cents)
        ? Math.max(0, Math.floor(body.cart_value_cents))
        : null;
      const { data: row } = await supabase
        .from("diner_web_sessions")
        .select("first_add_to_cart_at, items_added_count, cart_value_peak_cents")
        .eq("id", session_id)
        .maybeSingle();
      if (!row) return json({ error: "not found" }, 404);
      const update: Record<string, unknown> = {
        items_added_count: (row.items_added_count ?? 0) + 1,
      };
      if (!row.first_add_to_cart_at) update.first_add_to_cart_at = new Date().toISOString();
      if (cartValueCents != null && cartValueCents > (row.cart_value_peak_cents ?? 0)) {
        update.cart_value_peak_cents = cartValueCents;
      }
      await supabase.from("diner_web_sessions").update(update).eq("id", session_id);
      return json({ ok: true });
    }

    if (action === "order_placed") {
      const order_id = String(body?.order_id ?? "");
      if (!UUID_RE.test(order_id)) return json({ error: "invalid order_id" }, 400);

      // Bind the order to the session's own venue so a caller cannot
      // attach an arbitrary/foreign order_id to a session (cross-venue
      // analytics pollution / IDOR).
      const { data: sess, error: sessErr } = await supabase
        .from("diner_web_sessions")
        .select("venue_id")
        .eq("id", session_id)
        .maybeSingle();
      if (sessErr) return json({ error: "failed to load session" }, 500);
      if (!sess) return json({ error: "not found" }, 404);

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("venue_id")
        .eq("id", order_id)
        .maybeSingle();
      if (ordErr) return json({ error: "failed to load order" }, 500);
      if (!ord || ord.venue_id !== sess.venue_id) {
        return json({ error: "order does not belong to this session's venue" }, 403);
      }

      await supabase
        .from("diner_web_sessions")
        .update({
          order_placed_at: new Date().toISOString(),
          order_id,
          ended_at: new Date().toISOString(),
          end_reason: "ordered",
        })
        .eq("id", session_id);
      return json({ ok: true });
    }

    return json({ error: "unhandled action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
