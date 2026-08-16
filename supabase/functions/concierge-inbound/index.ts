// Concierge inbound webhook — the guest suite's front door.
//
// A messaging provider (Twilio SMS/WhatsApp, or any relay) POSTs each inbound
// guest message here. Vee answers from the venue's concierge settings, can
// take a booking, and every dialogue lands on the conversation record that
// venue staff see in the Concierge inbox.
//
// Auth (public function, verify_jwt=false):
//   x-concierge-token header must equal the CONCIERGE_WEBHOOK_TOKEN secret.
//   Set the same value as the webhook token in the provider's dashboard.
//   Until that secret exists every request is rejected — fail closed.
//
// Accepts JSON {to, from, body, channel?, guest_name?} or Twilio's
// form-encoded To/From/Body. Venue is resolved by concierge_settings
// .phone_number = to. Replies as JSON {reply}; a Twilio number can be wired
// via a TwiML Bin or Studio flow that relays this JSON reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, AiError } from "../_shared/ai.ts";
import { enforceRateLimit, getClientIp, tooManyRequests } from "../_shared/rate-limit.ts";
import { readJsonLimited, PayloadTooLargeError, payloadTooLarge } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-concierge-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Inbound {
  to: string;
  from: string;
  body: string;
  channel: "sms" | "whatsapp" | "web";
  guestName: string | null;
}

async function parseInbound(req: Request): Promise<Inbound | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    // Twilio webhook shape. WhatsApp numbers arrive as "whatsapp:+61…".
    const form = new URLSearchParams(await req.text());
    const to = form.get("To") ?? "";
    const from = form.get("From") ?? "";
    const body = form.get("Body") ?? "";
    if (!to || !from || !body) return null;
    const isWa = from.startsWith("whatsapp:");
    return {
      to: to.replace(/^whatsapp:/, ""),
      from: from.replace(/^whatsapp:/, ""),
      body,
      channel: isWa ? "whatsapp" : "sms",
      guestName: form.get("ProfileName"),
    };
  }
  const payload = (await readJsonLimited(req, 32 * 1024)) as Record<string, unknown>;
  const to = typeof payload.to === "string" ? payload.to : "";
  const from = typeof payload.from === "string" ? payload.from : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  if (!to || !from || !body) return null;
  const channel = payload.channel === "whatsapp" || payload.channel === "web"
    ? payload.channel
    : "sms";
  return {
    to, from, body, channel,
    guestName: typeof payload.guest_name === "string" ? payload.guest_name : null,
  };
}

/**
 * The model gives booking date/time in the venue's local time; the edge
 * runtime is UTC, so `new Date("YYYY-MM-DDTHH:MM")` would store 7pm UTC —
 * 5am in Melbourne. Convert via the IANA zone's offset at that instant.
 */
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date | null {
  const asUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(asUtc);
    const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = off.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = m ? (m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
    return new Date(asUtc.getTime() - minutes * 60_000);
  } catch {
    return asUtc; // unknown zone id — better a UTC booking than none
  }
}

/** The model is asked for strict JSON; parse defensively. */
function parseAgentReply(text: string): {
  reply: string;
  booking: { date: string; time: string; party_size: number; name: string | null } | null;
  needsHuman: boolean;
} {
  try {
    const cleaned = text.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.reply === "string") {
      const b = parsed.booking;
      const booking =
        b && typeof b.date === "string" && typeof b.time === "string" &&
        Number.isFinite(Number(b.party_size))
          ? {
              date: b.date,
              time: b.time,
              party_size: Math.max(1, Math.round(Number(b.party_size))),
              name: typeof b.name === "string" ? b.name : null,
            }
          : null;
      return { reply: parsed.reply, booking, needsHuman: parsed.needs_human === true };
    }
  } catch {
    // Model ignored the format — treat the whole text as the reply.
  }
  return { reply: text.trim(), booking: null, needsHuman: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("CONCIERGE_WEBHOOK_TOKEN") ?? "";
  const provided = req.headers.get("x-concierge-token") ?? "";
  if (!expected || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let inbound: Inbound | null;
  try {
    inbound = await parseInbound(req);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) return payloadTooLarge(corsHeaders);
    return json({ error: "Malformed request" }, 400);
  }
  if (!inbound) return json({ error: "to, from and body are required" }, 400);

  // One guest can't flood a venue's inbox or its AI spend.
  const rl = await enforceRateLimit(supabase, [
    { key: `concierge:from:${inbound.from}`, limit: 20, windowSec: 3600 },
    { key: `concierge:ip:${getClientIp(req)}`, limit: 120, windowSec: 3600 },
  ]);
  if (!rl.allowed) return tooManyRequests(corsHeaders);

  // Resolve the venue by its concierge number.
  const { data: settings } = await supabase
    .from("concierge_settings")
    .select("venue_id, is_enabled, greeting, channels, forward_to_phone")
    .eq("phone_number", inbound.to)
    .maybeSingle();
  if (!settings || !settings.is_enabled) {
    return json({ error: "No concierge is enabled on this number" }, 404);
  }
  const channels = (settings.channels ?? {}) as Record<string, boolean>;
  if (inbound.channel !== "web" && channels[inbound.channel] !== true) {
    return json({ error: `Channel ${inbound.channel} is not enabled` }, 404);
  }
  const venueId = settings.venue_id as string;

  const { data: venue } = await supabase
    .from("venues")
    .select("name, timezone")
    .eq("id", venueId)
    .single();
  const venueTz = venue?.timezone || "Australia/Sydney";

  // Find an open conversation for this guest in the last 24h, else start one.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: existing } = await supabase
    .from("concierge_conversations")
    .select("id, status")
    .eq("venue_id", venueId)
    .eq("guest_phone", inbound.from)
    .neq("status", "resolved")
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error: convErr } = await supabase
      .from("concierge_conversations")
      .insert({
        venue_id: venueId,
        channel: inbound.channel,
        guest_phone: inbound.from,
        guest_name: inbound.guestName,
      })
      .select("id")
      .single();
    if (convErr) return json({ error: "Could not open conversation" }, 500);
    conversationId = created.id;
  }

  const now = new Date().toISOString();
  await supabase.from("concierge_messages").insert({
    conversation_id: conversationId,
    venue_id: venueId,
    role: "guest",
    body: inbound.body,
  });

  // Build the transcript for the model (most recent 20 turns).
  const { data: history } = await supabase
    .from("concierge_messages")
    .select("role, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const transcript = (history ?? []).reverse();

  // Venue-local date — the UTC date is already "yesterday" for an Australian
  // evening, which would make the model resolve "tomorrow" to the wrong day.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: venueTz }).format(new Date());
  const system = [
    `You are Vee, the AI concierge for the venue "${venue?.name ?? "this venue"}".`,
    settings.greeting ? `House greeting: ${settings.greeting}` : "",
    `You answer guest messages (${inbound.channel}) briefly and warmly, like a great front-of-house person. Keep replies under 60 words — this is a text conversation.`,
    `You can take table bookings. Today is ${today} (venue local time). When the guest has given a date, a time and a party size, confirm the booking.`,
    `Respond ONLY with JSON: {"reply": "<your message to the guest>", "booking": null | {"date": "YYYY-MM-DD", "time": "HH:MM", "party_size": <int>, "name": "<guest name or null>"}, "needs_human": <true if the guest needs a person — complaints, refunds, anything you cannot do>}.`,
    `Only include "booking" once ALL of date, time and party size are known — otherwise ask for what's missing.`,
  ].filter(Boolean).join("\n");

  let agentText: string;
  try {
    const result = await aiChat({
      role: "chat",
      messages: [
        { role: "system", content: system },
        ...transcript.map((m) => ({
          role: m.role === "guest" ? "user" : "assistant",
          content: m.body,
        })),
      ],
      maxTokens: 400,
      timeoutMs: 30_000,
      usage: { venueId, feature: "concierge_chat", sessionId: conversationId },
    });
    agentText = result.text;
  } catch (e) {
    // No AI provider configured (or provider down): flag for a human and
    // fall back to a message-taken flow rather than dropping the guest.
    console.error(
      "[concierge-inbound] aiChat failed",
      e instanceof AiError ? `${e.status} ${e.message}` : e,
    );
    await supabase
      .from("concierge_conversations")
      .update({ status: "needs_human", last_message_at: now })
      .eq("id", conversationId);
    const fallback =
      "Thanks for your message! A team member will get back to you shortly.";
    await supabase.from("concierge_messages").insert({
      conversation_id: conversationId,
      venue_id: venueId,
      role: "system",
      body: `AI unavailable — message taken. Guest said: "${inbound.body.slice(0, 200)}"`,
    });
    return json({ reply: fallback, conversation_id: conversationId });
  }

  const { reply, booking, needsHuman } = parseAgentReply(agentText);
  let bookingId: string | null = null;

  if (booking) {
    const startsAt = zonedTimeToUtc(booking.date, booking.time, venueTz);
    if (startsAt && startsAt.getTime() > Date.now() - 3600_000) {
      const { data: bset } = await supabase
        .from("venue_booking_settings")
        .select("auto_confirm, default_duration_minutes")
        .eq("venue_id", venueId)
        .maybeSingle();
      const { data: b, error: bErr } = await supabase
        .from("bookings")
        .insert({
          venue_id: venueId,
          guest_name: booking.name ?? inbound.guestName ?? inbound.from,
          guest_phone: inbound.from,
          party_size: booking.party_size,
          starts_at: startsAt.toISOString(),
          duration_minutes: bset?.default_duration_minutes ?? 90,
          status: (bset?.auto_confirm ?? true) ? "confirmed" : "pending",
          source: "concierge",
        })
        .select("id")
        .single();
      if (!bErr && b) {
        bookingId = b.id;
        await supabase.from("booking_events").insert({
          booking_id: b.id,
          venue_id: venueId,
          event: "created",
          meta: { source: "concierge", conversation_id: conversationId },
        });
      }
    }
  }

  await supabase.from("concierge_messages").insert({
    conversation_id: conversationId,
    venue_id: venueId,
    role: "vee",
    body: reply,
    meta: bookingId ? { booking_id: bookingId } : {},
  });
  await supabase
    .from("concierge_conversations")
    .update({
      last_message_at: now,
      ...(inbound.guestName ? { guest_name: inbound.guestName } : {}),
      ...(bookingId ? { booking_id: bookingId, outcome: "booked" } : {}),
      ...(needsHuman ? { status: "needs_human" } : {}),
    })
    .eq("id", conversationId);

  return json({
    reply,
    conversation_id: conversationId,
    booking_id: bookingId,
    needs_human: needsHuman,
  });
});
