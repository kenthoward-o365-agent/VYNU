import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://deno.land/x/cors@v1.2.2/mod.ts";

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
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

    // Request token from H&L OrderNOW OAuth endpoint
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
      return new Response(
        JSON.stringify({ error: "Token request failed", details: errBody }),
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
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
