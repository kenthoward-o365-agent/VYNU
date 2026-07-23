// Sends a receipt link via SMS and optionally captures the phone as a marketing opt-in.
// Public function (no JWT) — guests use it from the receipt screen.
// Uses Twilio if TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER are set,
// otherwise runs in simulated mode and still records the subscriber.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enforceRateLimit, getClientIp, tooManyRequests } from "../_shared/rate-limit.ts";
import { readJsonLimited, PayloadTooLargeError, payloadTooLarge } from "../_shared/http.ts";

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
    // AEA-11: cap body size before parsing.
    const parsed = await readJsonLimited(req) as Record<string, unknown>;
    // NOTE: `receipt_url` is intentionally NOT read from the body — see AEA-01.
    // A caller-supplied link let attackers send phishing URLs from the venue's
    // trusted sender. The receipt link is now built server-side below.
    const venue_id = parsed.venue_id as string | undefined;
    const order_id = parsed.order_id as string | undefined;
    const phone = parsed.phone as string | undefined;
    const marketing_opt_in = parsed.marketing_opt_in;
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

    // AEA-01/AEA-02: rate limit this public, SMS-sending endpoint across several
    // dimensions so a leaked (venue_id, order_id) pair can't be looped to spam
    // arbitrary numbers or run up the venue's Twilio bill. The destination phone
    // is caller-supplied by design (guests type their own number on the receipt
    // screen), so volume limits are the primary abuse control here.
    const ip = getClientIp(req);
    const rl = await enforceRateLimit(admin, [
      { key: `send-receipt-sms:order:${order_id}`, limit: 3, windowSec: 86400 },
      { key: `send-receipt-sms:phone:${normalized}`, limit: 5, windowSec: 3600 },
      { key: `send-receipt-sms:ip:${ip}`, limit: 10, windowSec: 3600 },
      { key: `send-receipt-sms:venue:${venue_id}`, limit: 100, windowSec: 3600 },
    ], { failClosed: true }); // paid SMS path — deny if the limiter is unavailable
    if (!rl.allowed) return tooManyRequests(corsHeaders);

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

    // AEA-01: build the receipt link server-side from the (validated) order —
    // never from the request body — so an attacker cannot inject a phishing URL
    // into an SMS sent under the venue's sender ID.
    const link = `https://hlordernow.lovable.app/order/${venue_id}/_/receipt/${order_id}`;
    const body = `${venueName}: Thanks for visiting! Your receipt: ${link}${marketing_opt_in ? " — Reply STOP to opt out." : ""}`;

    let sendResult: { simulated: boolean; sid?: string } = { simulated: true };
    try {
      sendResult = await sendTwilio(normalized, body);
    } catch (e) {
      console.error("twilio error", e);
      // AEA-16: don't leak upstream provider error text to the caller.
      return new Response(JSON.stringify({ error: "Failed to send SMS" }), {
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
    if (e instanceof PayloadTooLargeError) return payloadTooLarge(corsHeaders);
    console.error(e);
    // AEA-16: generic error to the caller; detail stays in the logs.
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
