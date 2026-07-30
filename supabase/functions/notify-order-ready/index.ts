// Notifies a diner that their order is ready for collection.
// Called by venue staff apps when an order flips to "ready" in a counter-pickup zone.
// Sends an SMS via Twilio when configured (simulated otherwise) and always writes an
// in-app notification row so the diner app can surface an alert.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeAuPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  if (digits.startsWith("61")) return "+" + digits;
  return digits.length >= 8 ? "+" + digits : null;
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return { simulated: true };
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
    },
  );
  const out = await res.json();
  if (!res.ok) throw new Error(out?.message || "Twilio send failed");
  return { simulated: false, sid: out.sid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.order_id === "string" ? body.order_id : null;
    if (!orderId) return json({ error: "order_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: order } = await admin
      .from("orders")
      .select("id, venue_id, customer_id, table_id, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
    if (!isAdmin) {
      const { data: isStaff } = await admin.rpc("is_venue_staff", { _user_id: user.id, _venue_id: order.venue_id });
      if (!isStaff) return json({ error: "Not authorised" }, 403);
    }

    // Resolve venue + zone service settings.
    const { data: venue } = await admin
      .from("venues")
      .select("name, default_service_mode, default_pickup_location")
      .eq("id", order.venue_id)
      .maybeSingle();

    let zone: any = null;
    if (order.table_id) {
      const { data: table } = await admin
        .from("tables")
        .select("table_number, zone_id")
        .eq("id", order.table_id)
        .maybeSingle();
      if (table?.zone_id) {
        const { data: z } = await admin
          .from("venue_zones")
          .select("name, service_mode, pickup_location_label, notify_sms_on_ready, notify_inapp_on_ready")
          .eq("id", table.zone_id)
          .maybeSingle();
        zone = z;
      }
    }

    const serviceMode = !zone?.service_mode || zone.service_mode === "inherit"
      ? (venue?.default_service_mode || "table_delivery")
      : zone.service_mode;
    const pickupLocation = (zone?.pickup_location_label || venue?.default_pickup_location || "the counter").trim();
    const smsEnabled = zone ? zone.notify_sms_on_ready !== false : true;
    const inAppEnabled = zone ? zone.notify_inapp_on_ready !== false : true;

    if (serviceMode !== "counter_pickup") {
      return json({ skipped: "table_delivery" });
    }

    const message = `${venue?.name || "Your order"}: your order is ready — please collect it at ${pickupLocation}.`;

    // In-app alert for the diner.
    let inApp = false;
    if (inAppEnabled) {
      const { error } = await admin.from("notifications").insert({
        venue_id: order.venue_id,
        kind: "order_ready",
        title: "Your order is ready",
        body: message,
        diner_id: order.customer_id ?? null,
        payload: { order_id: order.id, pickup_location: pickupLocation },
      } as any);
      inApp = !error;
    }

    // SMS to the diner if we hold a number.
    let sms: Record<string, unknown> = { sent: false, reason: "no_phone" };
    if (smsEnabled && order.customer_id) {
      const { data: profile } = await admin
        .from("diner_profiles")
        .select("sms_e164, phone")
        .or(`id.eq.${order.customer_id},user_id.eq.${order.customer_id}`)
        .limit(1)
        .maybeSingle();
      const raw = profile?.sms_e164 || profile?.phone;
      const to = raw ? normalizeAuPhone(raw) : null;
      if (to) {
        try {
          const result = await sendSms(to, message);
          sms = { sent: true, ...result };
        } catch (e) {
          console.error("notify-order-ready sms failed:", (e as Error).message);
          sms = { sent: false, reason: "send_failed" };
        }
      }
    } else if (!smsEnabled) {
      sms = { sent: false, reason: "disabled_for_zone" };
    }

    return json({ ok: true, service_mode: serviceMode, pickup_location: pickupLocation, in_app: inApp, sms });
  } catch (err) {
    console.error("notify-order-ready error:", (err as Error).message);
    return json({ error: "Unexpected error" }, 500);
  }
});
