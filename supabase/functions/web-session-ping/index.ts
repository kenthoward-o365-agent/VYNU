// Tab-close beacon endpoint: marks a diner_web_session as ended.
// Called via navigator.sendBeacon, so it must be POST + no auth.
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
const ALLOWED_REASONS = new Set(["tab_closed", "manual_close", "idle_timeout"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const session_id = String(body?.session_id ?? "");
    const end_reason = String(body?.end_reason ?? "tab_closed");
    if (!UUID_RE.test(session_id) || !ALLOWED_REASONS.has(end_reason)) {
      return new Response(JSON.stringify({ error: "invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase
      .from("diner_web_sessions")
      .update({ ended_at: new Date().toISOString(), end_reason })
      .eq("id", session_id)
      .is("ended_at", null);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
