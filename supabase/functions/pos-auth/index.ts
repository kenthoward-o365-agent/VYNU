import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { safeErrorResponse } from "../_shared/safe-error.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TokenCache {
  access_token: string;
  expires_at: number; // epoch ms
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Authorization ─────────────────────────────────────────────
    // This endpoint mints a live POS OAuth access token that grants
    // read/write on the venue's POS. It is an INTERNAL, server-to-server
    // helper — its only legitimate caller is `pos-order-webhook`, which
    // invokes it with the service-role key. It must never be reachable
    // by a browser/anon caller (the public anon key satisfies the
    // gateway's `verify_jwt`, so gateway auth is NOT sufficient here).
    // We therefore require the caller to present the service-role key.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer || bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );

    // Fetch integration config
    const { data: integration, error } = await supabase
      .from("venue_pos_integrations")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    if (error || !integration) {
      return new Response(
        JSON.stringify({ error: "No POS integration found" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Check cached token
    const cache = integration.token_cache as TokenCache | null;
    if (cache?.access_token && cache.expires_at > Date.now() + 60_000) {
      return new Response(
        JSON.stringify({ access_token: cache.access_token }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Get client secret from Supabase secrets or config
    const clientId = integration.client_id;
    const clientSecretRef = integration.client_secret_ref;

    if (!clientId || !clientSecretRef) {
      return new Response(
        JSON.stringify({ error: "OAuth credentials not configured" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // The client_secret_ref points to a Supabase secret name
    const clientSecret = Deno.env.get(clientSecretRef);
    if (!clientSecret) {
      return new Response(
        JSON.stringify({ error: `Secret ${clientSecretRef} not found` }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Request token from VYNU OAuth endpoint
    const tokenUrl = `${integration.endpoint_url}/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "pos:read pos:write orders:read orders:write",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      // Detail stays server-side; do not echo the upstream OAuth error body to the caller.
      console.error("[pos-auth] token request failed", tokenRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "Token request failed" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenRes.json();
    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

    // Cache the token
    await supabase
      .from("venue_pos_integrations")
      .update({
        token_cache: {
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        },
      })
      .eq("venue_id", venue_id);

    return new Response(
      JSON.stringify({ access_token: tokenData.access_token }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return safeErrorResponse("pos-auth", err, CORS);
  }
});
