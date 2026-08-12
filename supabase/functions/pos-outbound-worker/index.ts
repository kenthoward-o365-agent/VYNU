// Outbound POS worker: drains jobs_pos_outbound. Each message is one of:
//   { kind: "push_menu",    venue_id, menu }
//   { kind: "menu_pull",    venue_id, trigger?, topic? }   (kicks pos-menu-pull)
//   { kind: "menu_push_queue_item", venue_id, queue_id }   (process approved row)
//   { kind: "snooze",       venue_id, plu, snooze_until }
//   { kind: "update_order", venue_id, external_order_id, status }
//   { kind: "send_order",   venue_id, order | order_id, force? }
// Wrapped in the shared circuit breaker so a flapping POS doesn't stall
// the queue. Run via pg_cron every 10s alongside process-job-queue.
//
// HLRDRNW-29 — delivery guarantees:
//
//  * Backoff. A failed job is re-hidden for an exponentially growing delay via
//    set_job_vt() rather than pgmq's fixed 90s visibility timeout. The retry
//    budget now spans ~45 minutes instead of ~6.
//  * Real attempt counting. pgmq's read_ct counts *reads*, so a job deferred
//    because the breaker was open used to burn an attempt without ever
//    contacting the POS — during an outage every queued order exhausted its
//    budget on "Circuit open" and was dropped. Attempts are counted in
//    pos_outbound_job_state and only incremented when we actually reach out.
//  * Single-flight. send_order claims the order (claim_order_for_pos_push)
//    before pushing, so a redelivered job cannot produce a second docket.
//  * Dead letter. Terminal failures are written to pos_outbound_dlq with their
//    full payload and raise a venue notification, instead of being deleted.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAdapter, PosDataError } from "../_shared/pos-adapter.ts";
import {
  loadIntegration,
  buildContext,
  runWithBreaker,
  breakerAllows,
  breakerRetryAfterSeconds,
} from "../_shared/pos-context.ts";
import type { IntegrationRow } from "../_shared/pos-context.ts";
import { timingSafeEqualStr } from "../_shared/secure-compare.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUEUE = "jobs_pos_outbound";
const VT_SECONDS = 90;              // invisibility while this invocation works the job
const BATCH = 25;

// Attempts that actually reached the POS. 8 attempts on the backoff curve below
// span ~45 minutes, so a paid order survives a realistic Exceed outage.
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 900;

// A job the breaker keeps deferring would otherwise live forever. Past this age
// it dead-letters regardless, so ops get told rather than it silently ageing.
const MAX_JOB_AGE_SECONDS = 6 * 60 * 60;

// How long a 'sending' claim is trusted before another invocation may take it.
const CLAIM_TTL_SECONDS = 300;

/** 30s, 60s, 2m, 4m, 8m, 15m, 15m... with jitter to avoid a synchronised herd. */
function backoffSeconds(attempt: number): number {
  const raw = BACKOFF_BASE_SECONDS * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(raw, BACKOFF_MAX_SECONDS);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.max(5, Math.round(capped * jitter));
}

type WorkResult = { ok: true; skipped?: string } | { ok: false; error: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // AEA-06: require an explicit CRON_SECRET / service-role bearer. The gateway
  // verify_jwt check is satisfied by the public anon key, so without this any
  // anon-key holder could trigger the outbound POS worker (and its menu-pull
  // fan-out). Mirrors session-tick / process-job-queue.
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!token || (!timingSafeEqualStr(token, cronSecret ?? "") && !timingSafeEqualStr(token, svcKey))) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: msgs, error } = await supabase.rpc("dequeue_jobs", {
    _queue: QUEUE, _vt_seconds: VT_SECONDS, _qty: BATCH,
  });
  if (error) {
    console.error("[pos-outbound-worker] dequeue failed", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let processed = 0, dlq = 0, retried = 0, deferred = 0, skipped = 0;

  for (const m of (msgs as any[] | null) ?? []) {
    const payload = m.message ?? {};
    const venueId = payload.venue_id as string;
    const msgId = m.msg_id as number;
    const orderId: string | null = payload.order_id ?? payload.order?.orderId ?? null;

    const ageSeconds = m.enqueued_at
      ? (Date.now() - new Date(m.enqueued_at).getTime()) / 1000
      : 0;

    // ---- Load the integration first: everything below needs it -------------
    let integ: IntegrationRow | null = null;
    let loadError = "";
    try {
      integ = await loadIntegration(supabase, venueId);
      if (!integ) loadError = "integration missing";
    } catch (err) {
      loadError = (err as Error).message ?? String(err);
    }

    if (loadError) {
      const attempt = await bumpAttempt(supabase, msgId, loadError);
      const outcome = await handleFailure(supabase, {
        m, payload, venueId, orderId, attempt, error: loadError,
        terminal: attempt >= MAX_ATTEMPTS || ageSeconds > MAX_JOB_AGE_SECONDS,
        breakerState: null,
      });
      if (outcome === "dlq") dlq++; else retried++;
      continue;
    }

    // ---- Breaker open: defer without spending an attempt -------------------
    // The whole point of the breaker is that this call would be rejected
    // locally. Counting it as a delivery attempt is what used to drain the
    // retry budget during an outage and drop paid orders.
    if (!breakerAllows(integ!)) {
      if (ageSeconds > MAX_JOB_AGE_SECONDS) {
        const landed = await deadLetter(supabase, {
          m, payload, venueId, orderId,
          attempt: 0,
          error: `Circuit open for ${integ!.pos_provider} and job exceeded max age`,
          breakerState: integ!.breaker_state,
        });
        if (landed) dlq++; else retried++;
        continue;
      }
      const wait = breakerRetryAfterSeconds(integ!);
      await setVt(supabase, msgId, wait);
      console.log(`[pos-outbound-worker] msg ${msgId} deferred ${wait}s (breaker open, venue ${venueId})`);
      deferred++;
      continue;
    }

    // ---- send_order: claim the order before doing anything else ------------
    if (payload.kind === "send_order") {
      if (!orderId) {
        // Nothing to de-duplicate against; a payload this shape is a bug, not a
        // transient fault, so dead-letter it rather than retrying eight times.
        const landed = await deadLetter(supabase, {
          m, payload, venueId, orderId: null, attempt: 0,
          error: "send_order job carries neither order_id nor order.orderId",
          breakerState: integ!.breaker_state,
        });
        if (landed) dlq++; else retried++;
        continue;
      }

      const { data: claimResult, error: claimErr } = await supabase.rpc(
        "claim_order_for_pos_push",
        { _order_id: orderId, _force: payload.force === true, _claim_ttl_seconds: CLAIM_TTL_SECONDS },
      );
      if (claimErr) {
        const attempt = await bumpAttempt(supabase, msgId, claimErr.message);
        const outcome = await handleFailure(supabase, {
          m, payload, venueId, orderId, attempt, error: `claim failed: ${claimErr.message}`,
          terminal: attempt >= MAX_ATTEMPTS, breakerState: integ!.breaker_state,
        });
        if (outcome === "dlq") dlq++; else retried++;
        continue;
      }
      const claim = String(claimResult ?? "");

      if (claim === "already_sent") {
        // A redelivery of a push that already landed. This is the guarantee
        // working, not an error: ack and move on.
        await logSync(supabase, venueId, "outbound_send_order", "success",
          `Skipped: order ${orderId} already delivered to POS`);
        await ackAndClear(supabase, msgId);
        skipped++;
        continue;
      }
      if (claim === "in_progress") {
        await setVt(supabase, msgId, CLAIM_TTL_SECONDS);
        deferred++;
        continue;
      }
      if (claim === "not_found") {
        const landed = await deadLetter(supabase, {
          m, payload, venueId, orderId, attempt: 0,
          error: `order ${orderId} not found`,
          breakerState: integ!.breaker_state,
        });
        if (landed) dlq++; else retried++;
        continue;
      }
      if (claim === "reclaimed_stale") {
        // The previous attempt died mid-push and we never learned whether Exceed
        // accepted it. Re-sending risks a duplicate; not sending risks losing a
        // paid order. We re-send and make the risk visible.
        console.warn(`[pos-outbound-worker] order ${orderId}: re-sending after a stale claim — possible duplicate in Exceed`);
        await logSync(supabase, venueId, "outbound_send_order_reclaimed", "error",
          `Order ${orderId} re-sent after an inconclusive attempt — check Exceed for a duplicate docket`);
      }
    }

    // ---- Attempt ------------------------------------------------------------
    const attempt = await bumpAttempt(supabase, msgId);
    let ok = false, errMsg = "", dataError = false;

    try {
      const adapter = await loadAdapter(integ!.pos_providers?.slug ?? integ!.pos_provider);
      if (!adapter) throw new Error("adapter missing");
      const ctx = await buildContext(supabase, integ!);

      const result = await runWithBreaker<WorkResult>(supabase, integ!, async () => {
        switch (payload.kind) {
          case "push_menu": {
            if (!adapter.pushMenu) throw new Error("pushMenu unsupported");
            const r = await adapter.pushMenu(ctx, payload.menu);
            // The adapter reports failure in its return value rather than by
            // throwing. This was previously unchecked, so a rejected menu push
            // was logged as a success and the job acked.
            return r.ok ? { ok: true } : { ok: false, error: r.error ?? "pushMenu failed" };
          }

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
            let orderPayload: any = payload.order;

            // If only order_id was provided, build an OutboundOrder from the DB.
            if (!orderPayload) {
              const { data: ord } = await supabase
                .from("orders")
                .select("id, table_id, total, customer_notes, gratuity_amount, " +
                        "tables ( table_number ), " +
                        "order_items ( quantity, unit_price, notes, modifiers, " +
                        "  menu_items ( plu, pos_id, name ) )")
                .eq("id", orderId).maybeSingle();
              if (!ord) throw new Error(`order ${orderId} not found`);
              const items = (ord as any).order_items ?? [];
              const subtotal = items.reduce(
                (s: number, li: any) => s + Number(li.unit_price) * Number(li.quantity), 0,
              );
              orderPayload = {
                orderId: ord.id,
                tableExternalId: (ord as any).tables?.table_number ?? null,
                lineItems: items.map((li: any) => ({
                  posId: li.menu_items?.plu || li.menu_items?.pos_id || "",
                  // H&L requires a description per line and prints it on the
                  // docket, so the product name has to travel with the PLU.
                  name: li.menu_items?.name ?? null,
                  quantity: Number(li.quantity),
                  unitPrice: Number(li.unit_price),
                  notes: li.notes ?? null,
                  modifiers: Array.isArray(li.modifiers)
                    ? li.modifiers.map((m: any) => ({
                        posId: m.plu || m.pos_id || "",
                        name: m.name ?? m.description ?? null,
                        quantity: Number(m.quantity ?? 1),
                        unitPrice: Number(m.price ?? 0),
                      }))
                    : [],
                })),
                totals: {
                  subtotal,
                  tax: 0,
                  total: Number((ord as any).total ?? subtotal),
                  tip: Number((ord as any).gratuity_amount ?? 0),
                },
              };
            }

            const sent = await adapter.sendOrder(ctx, orderPayload);
            // A 2xx that still isn't an acceptance is a payload problem, not an
            // availability one — PosDataError keeps it off the breaker and
            // dead-letters it immediately rather than retrying for 45 minutes.
            if (!sent.accepted) throw new PosDataError("POS did not accept order");

            // Lines that fell back to a placeholder PLU. The push succeeded and
            // Sysnet reconciles them downstream, but the substitution must stay
            // visible: record it on the order and as its own sync-log event so
            // an operator can find and map the item.
            const unmapped = sent.unmapped ?? [];
            const warning = unmapped.length > 0
              ? `Sent with ${unmapped.length} unmapped item(s) as PLU 0 — ` +
                unmapped.map((u) => `${u.where} (${u.description}) posId=${JSON.stringify(u.posId)}`).join(", ")
              : null;

            // Records delivery and releases the claim in one write. pos_order_id
            // being set is what makes a later redelivery a no-op.
            const { error: markErr } = await supabase.from("orders").update({
              pos_order_id: sent.posOrderId ?? orderId,
              pos_push_status: "sent",
              pos_pushed_at: new Date().toISOString(),
              pos_push_error: warning,
              pos_push_claimed_at: null,
            } as any).eq("id", orderId);

            // The order is in Exceed either way, so this must not become a retry —
            // that would push it a second time. The order stays visible as
            // 'sending' in the POS delivery panel for manual reconciliation.
            if (markErr) {
              console.error(
                `[pos-outbound-worker] order ${orderId} delivered to POS as ` +
                `${sent.posOrderId ?? "(no id)"} but recording it failed — reconcile by hand`,
                markErr,
              );
              await logSync(supabase, venueId, "outbound_send_order_unrecorded", "error",
                `Order ${orderId} was delivered to the POS but could not be marked sent: ${markErr.message}`);
            }

            if (warning) {
              console.warn(`[pos-outbound-worker] ${orderId}: ${warning}`);
              await logSync(supabase, venueId, "order_unmapped_items", "error", warning);
            }
            return { ok: true };
          }

          default:
            throw new Error(`unknown kind: ${payload.kind}`);
        }
      });

      if (!result.ok) {
        errMsg = result.error;
        dataError = result.dataError;
      } else if (!result.value.ok) {
        errMsg = result.value.error;
      } else {
        ok = true;
      }
    } catch (err) {
      errMsg = (err as Error).message ?? String(err);
    }

    if (ok) {
      await logSync(supabase, venueId, `outbound_${payload.kind}`, "success", null);
      await ackAndClear(supabase, msgId);
      processed++;
      continue;
    }

    // A 4xx from the POS means it understood us and refused this order. Retrying
    // the identical payload will fail identically, so dead-letter it now and
    // alert instead of burning 45 minutes first.
    const terminal = dataError || attempt >= MAX_ATTEMPTS || ageSeconds > MAX_JOB_AGE_SECONDS;
    const outcome = await handleFailure(supabase, {
      m, payload, venueId, orderId, attempt, error: errMsg, terminal,
      breakerState: integ!.breaker_state,
    });
    if (outcome === "dlq") dlq++; else retried++;
  }

  return new Response(JSON.stringify({ processed, dlq, retried, deferred, skipped }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});

// ---- helpers -------------------------------------------------------------

async function bumpAttempt(
  supabase: SupabaseClient, msgId: number, error?: string,
): Promise<number> {
  const { data, error: rpcErr } = await supabase.rpc("bump_pos_job_attempt", {
    _queue: QUEUE, _msg_id: msgId, _error: error ?? null,
  });
  if (rpcErr) {
    console.error("[pos-outbound-worker] bump_pos_job_attempt failed", rpcErr);
    return 1;
  }
  return Number(data ?? 1);
}

async function setVt(supabase: SupabaseClient, msgId: number, seconds: number) {
  const { error } = await supabase.rpc("set_job_vt", {
    _queue: QUEUE, _msg_id: msgId, _vt_seconds: Math.round(seconds),
  });
  // Non-fatal: without it the job simply retries on the default 90s timeout.
  if (error) console.error("[pos-outbound-worker] set_job_vt failed", error);
}

async function ackAndClear(supabase: SupabaseClient, msgId: number) {
  await supabase.rpc("ack_job", { _queue: QUEUE, _msg_id: msgId });
  await supabase.rpc("clear_pos_job_state", { _queue: QUEUE, _msg_id: msgId });
}

async function logSync(
  supabase: SupabaseClient,
  venueId: string,
  eventType: string,
  result: "success" | "error",
  message: string | null,
) {
  await supabase.from("pos_sync_log").insert({
    venue_id: venueId,
    event_type: eventType,
    direction: "outbound",
    result,
    error_message: message ? message.slice(0, 500) : null,
  });
}

interface FailureCtx {
  m: any;
  payload: any;
  venueId: string;
  orderId: string | null;
  attempt: number;
  error: string;
  terminal: boolean;
  breakerState: string | null;
}

/** Retry with backoff, or dead-letter. Returns which happened. */
async function handleFailure(
  supabase: SupabaseClient, c: FailureCtx,
): Promise<"retry" | "dlq"> {
  await logSync(supabase, c.venueId, `outbound_${c.payload.kind}`, "error",
    `attempt ${c.attempt}/${MAX_ATTEMPTS}: ${c.error}`);

  if (c.terminal) {
    const landed = await deadLetter(supabase, c);
    // deadLetter() refuses to ack when it could not persist the payload, so a
    // failed insert leaves the job queued rather than silently destroying it.
    return landed ? "dlq" : "retry";
  }

  // Release the claim so the next attempt can take it.
  if (c.orderId && c.payload.kind === "send_order") {
    await supabase.from("orders").update({
      pos_push_status: "error",
      pos_push_error: c.error.slice(0, 500),
      pos_push_claimed_at: null,
    } as any).eq("id", c.orderId);
  }

  await setVt(supabase, c.m.msg_id, backoffSeconds(c.attempt));
  return "retry";
}

/**
 * Terminal failure: persist the full job payload, alert the venue, mark the
 * order, then ack. The payload is written *before* the ack — the old code
 * pgmq.delete()d the message, which destroyed the only copy of the job.
 *
 * Returns false when the DLQ row could not be written, in which case the caller
 * leaves the message on the queue instead.
 */
async function deadLetter(supabase: SupabaseClient, c: FailureCtx): Promise<boolean> {
  const { error: insertErr } = await supabase.from("pos_outbound_dlq").insert({
    venue_id: c.venueId,
    queue: QUEUE,
    msg_id: c.m.msg_id,
    kind: c.payload.kind ?? "unknown",
    order_id: c.orderId,
    payload: c.payload,
    attempts: c.attempt,
    last_error: c.error.slice(0, 2000),
    breaker_state: c.breakerState,
  } as any);

  if (insertErr) {
    console.error("[pos-outbound-worker] DLQ insert failed — leaving job queued", insertErr);
    await setVt(supabase, c.m.msg_id, BACKOFF_MAX_SECONDS);
    return false;
  }

  if (c.orderId && c.payload.kind === "send_order") {
    await supabase.from("orders").update({
      pos_push_status: "failed",
      pos_push_error: c.error.slice(0, 500),
      pos_push_claimed_at: null,
    } as any).eq("id", c.orderId);
  }

  // Alert. notifications is already realtime-published and its RLS lets venue
  // staff read venue-scoped rows, so this surfaces without new infrastructure.
  await supabase.from("notifications").insert({
    venue_id: c.venueId,
    kind: "pos_push_failed",
    title: c.payload.kind === "send_order"
      ? "Order not delivered to POS"
      : `POS job failed: ${c.payload.kind ?? "unknown"}`,
    body: `Gave up after ${c.attempt} attempt(s): ${c.error}`.slice(0, 500),
    payload: { order_id: c.orderId, kind: c.payload.kind, msg_id: c.m.msg_id },
  } as any);

  await logSync(supabase, c.venueId, `outbound_${c.payload.kind}_dlq`, "error",
    `Dead-lettered after ${c.attempt} attempt(s): ${c.error}`);

  console.error(`[pos-outbound-worker] DLQ msg ${c.m.msg_id} (${c.payload.kind}) venue ${c.venueId}: ${c.error}`);

  await ackAndClear(supabase, c.m.msg_id);
  return true;
}
