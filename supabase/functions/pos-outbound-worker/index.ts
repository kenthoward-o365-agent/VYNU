// Outbound POS worker: drains jobs_pos_outbound. Each message is one of:
//   { kind: "push_menu",    venue_id, menu }
//   { kind: "menu_pull",    venue_id, trigger?, topic? }   (kicks pos-menu-pull)
//   { kind: "menu_push_queue_item", venue_id, queue_id }   (process approved row)
//   { kind: "snooze",       venue_id, plu, snooze_until }
//   { kind: "update_order", venue_id, external_order_id, status }
//   { kind: "send_order",   venue_id, order }              (outbound to POS portal)
// Wrapped in the shared circuit breaker so a flapping POS doesn't stall
// the queue. Run via pg_cron every 10s alongside process-job-queue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAdapter } from "../_shared/pos-adapter.ts";
import { loadIntegration, buildContext, runWithBreaker } from "../_shared/pos-context.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUEUE = "jobs_pos_outbound";
const MAX_ATTEMPTS = 5;
const VT_SECONDS = 90;
const BATCH = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: msgs, error } = await supabase.rpc("dequeue_jobs", {
    _queue: QUEUE, _vt_seconds: VT_SECONDS, _qty: BATCH,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let processed = 0, dlq = 0, retried = 0;
  for (const m of (msgs as any[] | null) ?? []) {
    const payload = m.message ?? {};
    const venueId = payload.venue_id as string;
    let ok = false, errMsg = "";

    try {
      const integ = await loadIntegration(supabase, venueId);
      if (!integ) throw new Error("integration missing");
      const adapter = await loadAdapter(integ.pos_providers?.slug ?? integ.pos_provider);
      if (!adapter) throw new Error("adapter missing");
      const ctx = await buildContext(supabase, integ);

      const result = await runWithBreaker(supabase, integ, async () => {
        switch (payload.kind) {
          case "push_menu":
            if (!adapter.pushMenu) throw new Error("pushMenu unsupported");
            return await adapter.pushMenu(ctx, payload.menu);

          case "menu_pull": {
            // Fan out to pos-menu-pull so the heavy work lives in one place.
            const base = Deno.env.get("SUPABASE_URL")!;
            const res = await fetch(`${base}/functions/v1/pos-menu-pull`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ venue_id: venueId }),
            });
            if (!res.ok) throw new Error(`menu-pull ${res.status}: ${(await res.text()).slice(0, 200)}`);
            return { ok: true };
          }

          case "menu_push_queue_item": {
            if (!adapter.pushMenu) throw new Error("pushMenu unsupported");
            const queueId = payload.queue_id as string;
            const { data: row } = await supabase
              .from("pos_menu_change_queue")
              .select("id, payload, status")
              .eq("id", queueId).maybeSingle();
            if (!row || row.status !== "approved") return { ok: true }; // nothing to do
            const r = await adapter.pushMenu(ctx, row.payload);
            if (!r.ok) {
              await supabase.from("pos_menu_change_queue").update({
                status: "failed", error: r.error, sent_at: new Date().toISOString(),
              }).eq("id", queueId);
              throw new Error(r.error);
            }
            await supabase.from("pos_menu_change_queue").update({
              status: "sent", error: null, sent_at: new Date().toISOString(),
            }).eq("id", queueId);
            return { ok: true };
          }

          case "snooze":
            if (!adapter.snoozeProduct) throw new Error("snoozeProduct unsupported");
            await adapter.snoozeProduct(ctx, payload.plu, payload.snooze_until ?? null);
            return { ok: true };

          case "update_order":
            if (!adapter.updateOrderStatus) throw new Error("updateOrderStatus unsupported");
            await adapter.updateOrderStatus(ctx, payload.external_order_id, payload.status);
            return { ok: true };

          case "send_order": {
            if (!adapter.sendOrder) throw new Error("sendOrder unsupported");
            const sent = await adapter.sendOrder(ctx, payload.order);
            // Record the POS order id on our order row if present
            if (payload.order?.orderId && sent.posOrderId) {
              await supabase.from("orders").update({ pos_order_id: sent.posOrderId } as any)
                .eq("id", payload.order.orderId);
            }
            return { ok: true };
          }

          default:
            throw new Error(`unknown kind: ${payload.kind}`);
        }
      });

      if (!result.ok) throw new Error(result.error);
      ok = true;
    } catch (err) {
      errMsg = (err as Error).message ?? String(err);
    }

    await supabase.from("pos_sync_log").insert({
      venue_id: venueId,
      event_type: `outbound_${payload.kind}`,
      direction: "outbound",
      result: ok ? "success" : "error",
      error_message: ok ? null : errMsg,
    });

    if (ok) {
      await supabase.rpc("ack_job", { _queue: QUEUE, _msg_id: m.msg_id });
      processed++;
    } else if (m.read_ct >= MAX_ATTEMPTS) {
      await supabase.rpc("ack_job", { _queue: QUEUE, _msg_id: m.msg_id });
      dlq++;
    } else {
      retried++;
    }
  }

  return new Response(JSON.stringify({ processed, dlq, retried }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
