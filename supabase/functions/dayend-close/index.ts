// Dayend close — fronts the dayend_close() SQL function for two callers:
//
//   1. Manual (Close Day button): POST { venue_id } with a user JWT.
//      The caller must be an active owner/manager at the venue.
//   2. Auto tick (pg_cron every 10 min): POST { tick: true } with the
//      CRON_SECRET bearer. Sweeps every venue whose auto-close is enabled and
//      whose venue-local clock has passed auto_close_time for a business day
//      that is still behind the local date.
//
// Public function (verify_jwt=false in config.toml) — both auth modes are
// enforced in-body. A close with strategy 'halt' and open orders returns
// { halted: true, open_orders: n } and changes nothing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/secure-compare.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Venue-local "now" as {date: 'YYYY-MM-DD', time: 'HH:MM:SS'}. */
function localNow(timeZone: string): { date: string; time: string } {
  const d = new Date();
  try {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(d);
    return { date, time };
  } catch {
    // Unknown zone id — fall back to UTC rather than skipping the venue forever.
    return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON body required" }, 400);
  }

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const isCron = !!cronSecret && timingSafeEqualStr(bearer, cronSecret);

  // ---- Auto tick ---------------------------------------------------------
  if (body.tick === true) {
    if (!isCron) return json({ error: "Unauthorized" }, 401);

    const { data: candidates, error } = await service
      .from("venue_dayend_settings")
      .select("venue_id, auto_close_time, venues!inner(timezone, is_active)")
      .eq("auto_close_enabled", true);
    if (error) {
      console.error("[dayend-close] tick query failed", error.message);
      return json({ error: "Query failed" }, 500);
    }

    const results: Record<string, unknown>[] = [];
    for (const row of candidates ?? []) {
      const venueId = row.venue_id as string;
      const venue = row.venues as unknown as { timezone: string | null; is_active: boolean | null };
      if (venue?.is_active === false) continue;

      const { data: auditRow } = await service
        .from("venue_audit_dates")
        .select("audit_date")
        .eq("venue_id", venueId)
        .maybeSingle();
      if (!auditRow?.audit_date) continue;

      const { date: localDate, time: localTime } = localNow(venue?.timezone || "Australia/Sydney");
      const closeTime = String(row.auto_close_time); // 'HH:MM:SS'

      // Close only when the business day is behind the local calendar AND the
      // configured close time has passed. One day per tick; a venue several
      // days behind catches up over successive ticks.
      if (auditRow.audit_date >= localDate) continue;
      if (localTime < closeTime) continue;

      const { data: result, error: closeErr } = await service.rpc("dayend_close", {
        _venue_id: venueId, _actor: null, _mode: "auto",
      });
      if (closeErr) {
        console.error(`[dayend-close] auto close failed for ${venueId}`, closeErr.message);
        results.push({ venue_id: venueId, error: closeErr.message });
      } else {
        results.push({ venue_id: venueId, ...(result as Record<string, unknown>) });
      }
    }
    return json({ ok: true, processed: results.length, results });
  }

  // ---- Manual close ------------------------------------------------------
  const venueId = typeof body.venue_id === "string" ? body.venue_id : null;
  if (!venueId) return json({ error: "venue_id required" }, 400);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Owner/manager only — closing the day is a money-adjacent, irreversible act.
  const { data: staffRow } = await service
    .from("venue_staff")
    .select("role")
    .eq("venue_id", venueId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!staffRow || !["owner", "manager"].includes(String(staffRow.role))) {
    return json({ error: "Only owners and managers can close the day" }, 403);
  }

  const { data: result, error: closeErr } = await service.rpc("dayend_close", {
    _venue_id: venueId, _actor: user.id, _mode: "manual",
  });
  if (closeErr) {
    console.error(`[dayend-close] manual close failed for ${venueId}`, closeErr.message);
    return json({ error: "Close failed" }, 500);
  }
  return json(result);
});
