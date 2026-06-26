// Sends a receipt link via SMS and optionally captures the phone as a marketing opt-in.
// Public function (no JWT) — guests use it from the receipt screen.
// Uses Twilio if TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER are set,
// otherwise runs in simulated mode and still records the subscriber.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");

function normalizeAuPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  if (digits.startsWith("61")) return "+" + digits;
  return digits.length >= 8 ? "+" + digits : null;
}

async function sendTwilio(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { simulated: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Twilio send failed");
  return { simulated: false, sid: json.sid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { venue_id, order_id, phone, marketing_opt_in, receipt_url } = await req.json();
    if (!venue_id || !order_id || !phone) {
      return new Response(JSON.stringify({ error: "Missing venue_id, order_id, or phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const normalized = normalizeAuPhone(String(phone));
    if (!normalized) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Confirm the order belongs to the venue (anti-abuse)
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, venue_id")
      .eq("id", order_id)
      .eq("venue_id", venue_id)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: venue } = await admin
      .from("venues").select("name").eq("id", venue_id).maybeSingle();
    const venueName = venue?.name || "your venue";

    const link = receipt_url || `https://hlordernow.lovable.app/order/${venue_id}/_/receipt/${order_id}`;
    const body = `${venueName}: Thanks for visiting! Your receipt: ${link}${marketing_opt_in ? " — Reply STOP to opt out." : ""}`;

    let sendResult: { simulated: boolean; sid?: string } = { simulated: true };
    try {
      sendResult = await sendTwilio(normalized, body);
    } catch (e) {
      console.error("twilio error", e);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert subscriber record
    const now = new Date().toISOString();
    const { data: existing } = await admin
      .from("sms_subscribers")
      .select("id, marketing_opt_in, receipt_send_count")
      .eq("venue_id", venue_id)
      .eq("phone", normalized)
      .maybeSingle();

    if (existing) {
      await admin
        .from("sms_subscribers")
        .update({
          marketing_opt_in: marketing_opt_in ? true : existing.marketing_opt_in,
          opted_in_at: marketing_opt_in ? now : undefined,
          last_order_id: order_id,
          receipt_send_count: (existing.receipt_send_count ?? 0) + 1,
          last_receipt_sent_at: now,
          unsubscribed_at: null,
        })
        .eq("id", existing.id);
    } else {
      await admin.from("sms_subscribers").insert({
        venue_id,
        phone: normalized,
        marketing_opt_in: !!marketing_opt_in,
        opted_in_at: marketing_opt_in ? now : null,
        source: "receipt",
        last_order_id: order_id,
        receipt_send_count: 1,
        last_receipt_sent_at: now,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, simulated: sendResult.simulated, phone: normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
