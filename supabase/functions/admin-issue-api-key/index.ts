// Admin-only: issue a new API key for a partner.
// Returns the FULL key once (caller must store/display it). DB only stores the SHA-256 hash.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeErrorResponse } from "../_shared/safe-error.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(36)).join("").replace(/[^a-z0-9]/g, "").slice(0, len);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "tabless_admin");
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { partner_id, venue_id, scopes, label } = await req.json();
    if (!partner_id || !Array.isArray(scopes)) {
      return new Response(JSON.stringify({ error: "partner_id, scopes required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Use service role for the actual insert
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: partner } = await admin
      .from("api_partners").select("partner_type, is_active").eq("id", partner_id).maybeSingle();
    if (!partner) {
      return new Response(JSON.stringify({ error: "partner_not_found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const env = "live"; // future: support test/live env
    const prefix = `sk_${partner.partner_type}_${env}_${randomString(12)}`;
    const secret = randomString(32);
    const fullKey = `${prefix}.${secret}`;
    const hash = await sha256Hex(fullKey);

    const { data: keyRow, error } = await admin.from("api_keys").insert({
      partner_id, venue_id: venue_id ?? null, scopes, label: label ?? null,
      key_prefix: prefix, key_hash: hash, created_by: user.id,
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
      id: keyRow.id, key_prefix: prefix, full_key: fullKey,
      message: "Store this key now — it will not be shown again.",
    }), {
      status: 201, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return safeErrorResponse("admin-issue-api-key", e, CORS);
  }
});
