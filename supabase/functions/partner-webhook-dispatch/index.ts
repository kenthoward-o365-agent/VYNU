// Webhook dispatcher: enqueues + delivers partner webhooks with HMAC signing and retries.
//
// POST body: { webhook_id?, partner_type?, venue_id?, event_type, payload }
//   - If webhook_id: enqueue+deliver for that single webhook.
//   - If partner_type+venue_id: fan out to all matching active webhooks.
// GET (cron tick): retry pending deliveries whose next_retry_at has passed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 43200]; // 1m, 5m, 30m, 2h, 12h

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
}

// deno-lint-ignore no-explicit-any
async function deliver(supabase: any, deliveryId: string, webhook: Webhook, eventType: string, payload: unknown) {
  const body = JSON.stringify({ event: eventType, data: payload, delivered_at: new Date().toISOString() });
  const signature = await hmacSign(webhook.secret, body);
  let status = 0;
  let respBody = "";
  try {
    const r = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-H&L OrderNOW-Signature": signature,
        "X-H&L OrderNOW-Event": eventType,
      },
      body,
    });
    status = r.status;
    respBody = (await r.text()).slice(0, 2000);
  } catch (e) {
    respBody = `fetch_error: ${e instanceof Error ? e.message : String(e)}`;
  }

  const ok = status >= 200 && status < 300;
  const { data: existing } = await supabase
    .from("api_webhook_deliveries").select("attempt_count").eq("id", deliveryId).maybeSingle();
  const attempt = (existing?.attempt_count ?? 0) + 1;
  const nextRetry = ok || attempt >= RETRY_DELAYS_SEC.length
    ? null
    : new Date(Date.now() + RETRY_DELAYS_SEC[attempt - 1] * 1000).toISOString();

  await supabase.from("api_webhook_deliveries").update({
    response_status: status,
    response_body: respBody,
    attempt_count: attempt,
    delivered_at: ok ? new Date().toISOString() : null,
    next_retry_at: nextRetry,
  }).eq("id", deliveryId);

  await supabase.from("api_webhooks").update({
    last_delivery_at: new Date().toISOString(),
    last_delivery_status: status,
  }).eq("id", webhook.id);

  return { ok, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Require CRON_SECRET or service role key for all calls — this is an
  // internal dispatcher, never to be invoked by end users.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!token || (token !== cronSecret && token !== serviceKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  // GET = cron tick: retry pending deliveries whose retry time has elapsed.
  if (req.method === "GET") {
    const { data: pending } = await supabase
      .from("api_webhook_deliveries")
      .select("id, webhook_id, event_type, payload, api_webhooks!inner(id, url, secret, events, is_active)")
      .is("delivered_at", null)
      .lte("next_retry_at", new Date().toISOString())
      .limit(50);

    let attempted = 0;
    for (const d of pending ?? []) {
      // deno-lint-ignore no-explicit-any
      const wh = (d as any).api_webhooks;
      if (!wh?.is_active) continue;
      await deliver(supabase, d.id, wh, d.event_type, d.payload);
      attempted++;
    }
    return new Response(JSON.stringify({ retried: attempted }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // POST = dispatch new event
  try {
    const { webhook_id, partner_type, venue_id, event_type, payload } = await req.json();
    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let webhooks: Webhook[] = [];
    if (webhook_id) {
      const { data } = await supabase
        .from("api_webhooks").select("id, url, secret, events")
        .eq("id", webhook_id).eq("is_active", true).maybeSingle();
      if (data) webhooks = [data];
    } else if (partner_type && venue_id) {
      const { data } = await supabase
        .from("api_webhooks")
        .select("id, url, secret, events, api_partners!inner(partner_type, is_active)")
        .eq("venue_id", venue_id)
        .eq("is_active", true)
        .contains("events", [event_type])
        // deno-lint-ignore no-explicit-any
        .filter("api_partners.partner_type" as any, "eq", partner_type)
        .filter("api_partners.is_active", "eq", true);
      webhooks = (data ?? []) as Webhook[];
    }

    const results = [];
    for (const wh of webhooks) {
      const { data: delivery } = await supabase
        .from("api_webhook_deliveries")
        .insert({ webhook_id: wh.id, event_type, payload })
        .select().single();
      if (delivery) {
        const r = await deliver(supabase, delivery.id, wh, event_type, payload);
        results.push({ webhook_id: wh.id, ...r });
      }
    }

    return new Response(JSON.stringify({ delivered: results.length, results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
