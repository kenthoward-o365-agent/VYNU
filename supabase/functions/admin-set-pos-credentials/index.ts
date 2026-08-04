// Admin-only: store a per-venue POS secret in Vault via set_pos_credential().
// Body: { venue_id, field, value }   (field must be a `secret`-typed key in
// the provider's config_schema).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeErrorResponse } from "../_shared/safe-error.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Pure service client: used for role checks (role helpers are not callable by
  // anon/authenticated) and for set_pos_credential, which is granted to
  // service_role only. A caller-scoped client would execute the RPC as
  // `authenticated` and fail with "permission denied for function" — see
  // 20260804060000_fix_set_pos_credential_service_role.sql. Authorisation for the
  // credential write is therefore enforced here, below, before the RPC is called.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );


  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.slice(7));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const callerId = claims.claims.sub as string;

  try {
    const { venue_id, field, value } = await req.json();
    if (!venue_id || !field || typeof value !== "string" || value.length === 0) {
      return new Response(JSON.stringify({ error: "venue_id, field, value required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Authorize explicitly in the function (defense-in-depth, and so the
    // function does not rely solely on the RPC's internal check): the
    // caller must be a platform admin or a manager of this venue.
    const [
      { data: isAdmin, error: isAdminErr },
      { data: isMgr, error: isMgrErr },
    ] = await Promise.all([
      supabase.rpc("has_role", { _user_id: callerId, _role: "tabless_admin" }),
      supabase.rpc("is_venue_manager", { _user_id: callerId, _venue_id: venue_id }),
    ]);

    if (isAdminErr || isMgrErr) {
      return new Response(JSON.stringify({ error: "Authorization check failed" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin && !isMgr) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: secretId, error } = await supabase.rpc("set_pos_credential", {
      _venue_id: venue_id,
      _field: field,
      _value: value,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, secret_id: secretId }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return safeErrorResponse("admin-set-pos-credentials", err, CORS);
  }
});
