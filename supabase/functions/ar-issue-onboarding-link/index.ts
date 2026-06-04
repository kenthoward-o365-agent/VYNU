import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Not authorised" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { venue_id, methods_allowed = ["card", "becs"], expires_days = 7 } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenRaw = crypto.randomUUID() + "-" + crypto.randomUUID();
    const tokenHash = await sha256(tokenRaw);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_days);

    const { error } = await adminClient.from("ar_onboarding_tokens").insert({
      venue_id,
      token_hash: tokenHash,
      methods_allowed,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });
    if (error) throw error;

    const appUrl = Deno.env.get("APP_URL") || "https://hlordernow.lovable.app";
    const url = `${appUrl}/billing/setup/${tokenRaw}`;

    await adminClient.from("venue_billing_events").insert({
      venue_id,
      event_type: "onboarding_link_sent",
      description: "Self-serve payment setup link issued",
      metadata: { url, methods_allowed },
      created_by: user.id,
    });

    return new Response(JSON.stringify({ url, token: tokenRaw, expires_at: expiresAt.toISOString() }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-issue-onboarding-link error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
