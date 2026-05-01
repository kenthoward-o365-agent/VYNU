// Generic background job worker. Drains pgmq queues created in Phase 4
// (jobs_loyalty, jobs_reports, jobs_notifications). Scheduled by pg_cron
// every 10s — see migration that creates the cron job.
//
// Idempotency: every handler must be safe to retry. The visibility timeout
// (60s) means a slow job can be re-delivered; handlers use idempotency keys.
//
// DLQ: after MAX_ATTEMPTS retries, the message is logged with status='dlq'
// and acked so the queue isn't blocked.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { awardLoyalty } from "../_shared/loyalty-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const VISIBILITY_SECONDS = 60;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AdminClient = ReturnType<typeof createClient>;

interface QueueMsg {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  message: any;
}

async function logRun(
  admin: AdminClient,
  queue: string,
  msg: QueueMsg,
  status: "success" | "retry" | "dlq" | "error",
  durationMs: number,
  error?: string,
) {
  await admin.from("job_run_log").insert({
    queue,
    msg_id: msg.msg_id,
    status,
    attempt: msg.read_ct,
    duration_ms: durationMs,
    error: error ?? null,
    payload: msg.message ?? null,
  });
}

async function handleLoyalty(admin: AdminClient, payload: any) {
  return await awardLoyalty(admin, payload);
}

async function handleReport(admin: AdminClient, payload: any) {
  // Placeholder for Phase 4 reporting. Drops a notification so the operator
  // sees that the job completed; replace this with real report generation.
  await admin.from("notifications").insert({
    user_id: payload?.requested_by ?? null,
    venue_id: payload?.venue_id ?? null,
    kind: "report_ready",
    title: "Report ready",
    body: payload?.label ?? "Your report has finished generating.",
    payload: payload ?? {},
  });
  return { ok: true };
}

async function handleNotification(admin: AdminClient, payload: any) {
  // Generic notification fan-out (e.g. from a trigger). Inserts a row that
  // surfaces via realtime to the relevant operator/diner.
  await admin.from("notifications").insert({
    user_id: payload?.user_id ?? null,
    diner_id: payload?.diner_id ?? null,
    venue_id: payload?.venue_id ?? null,
    kind: payload?.kind ?? "info",
    title: payload?.title ?? "Notification",
    body: payload?.body ?? null,
    payload: payload?.payload ?? {},
  });
  return { ok: true };
}

const HANDLERS: Record<string, (admin: AdminClient, payload: any) => Promise<any>> = {
  jobs_loyalty: handleLoyalty,
  jobs_reports: handleReport,
  jobs_notifications: handleNotification,
};

async function drain(admin: AdminClient, queue: string) {
  const handler = HANDLERS[queue];
  if (!handler) return { processed: 0, errors: 0 };

  const { data: msgs, error } = await admin.rpc("dequeue_jobs", {
    _queue: queue,
    _vt_seconds: VISIBILITY_SECONDS,
    _qty: BATCH_SIZE,
  });
  if (error) {
    console.error(`dequeue_jobs(${queue}) failed`, error);
    return { processed: 0, errors: 1, dequeue_error: error.message };
  }
  const messages = (msgs ?? []) as QueueMsg[];
  let processed = 0;
  let errors = 0;

  for (const m of messages) {
    const start = Date.now();
    try {
      const result = await handler(admin, m.message);
      const ms = Date.now() - start;
      if (result?.error) throw new Error(result.error);
      await admin.rpc("ack_job", { _queue: queue, _msg_id: m.msg_id });
      await logRun(admin, queue, m, "success", ms);
      processed++;
    } catch (err) {
      const ms = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`worker error queue=${queue} msg=${m.msg_id}`, message);
      errors++;
      if (m.read_ct >= MAX_ATTEMPTS) {
        await admin.rpc("ack_job", { _queue: queue, _msg_id: m.msg_id });
        await logRun(admin, queue, m, "dlq", ms, message);
      } else {
        await logRun(admin, queue, m, "retry", ms, message);
        // Don't ack — pgmq makes it visible again after VISIBILITY_SECONDS.
      }
    }
  }
  return { processed, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: Record<string, any> = {};
    for (const queue of ["jobs_loyalty", "jobs_notifications", "jobs_reports"]) {
      results[queue] = await drain(admin, queue);
    }

    return json({ ok: true, results });
  } catch (err) {
    console.error("process-job-queue error", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
