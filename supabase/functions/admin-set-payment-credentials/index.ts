import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Allowed credential / config fields the admin can set on venue_payment_config.
// Anything not in this list is silently ignored.
const ALLOWED_FIELDS = new Set([
  "api_key_test",
  "api_key_live",
  "client_key_test",
  "client_key_live",
  "merchant_account",
  "hmac_key",
  "apple_pay_merchant_id",
  "google_pay_merchant_id",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Authentication required" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is a Tab-Less platform admin.
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "tabless_admin",
    });
    if (!isAdmin) return json({ error: "Not authorised" }, 403);

    const body = await req.json();
    const { venue_id, action } = body;
    if (!venue_id) return json({ error: "venue_id required" }, 400);

    // ── GET (returns whether each field is set, never the actual values) ──
    if (action === "get") {
      const { data: config } = await adminClient
        .from("venue_payment_config")
        .select(
          "id, environment, merchant_account, merchant_status, api_key_test, api_key_live, client_key_test, client_key_live, hmac_key, apple_pay_merchant_id, google_pay_merchant_id"
        )
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments")
        .maybeSingle();

      if (!config) {
        return json({
          exists: false,
          environment: "test",
          fields: {},
        });
      }

      // Mask: report presence + last 4 chars of identifiers (never of api keys)
      const mask = (v: string | null) =>
        v ? { set: true, preview: v.length > 4 ? `…${v.slice(-4)}` : "set" } : { set: false };
      return json({
        exists: true,
        environment: config.environment,
        merchant_status: config.merchant_status,
        merchant_account: config.merchant_account || "",
        apple_pay_merchant_id: config.apple_pay_merchant_id || "",
        google_pay_merchant_id: config.google_pay_merchant_id || "",
        fields: {
          api_key_test: mask(config.api_key_test),
          api_key_live: mask(config.api_key_live),
          client_key_test: mask(config.client_key_test),
          client_key_live: mask(config.client_key_live),
          hmac_key: mask(config.hmac_key),
        },
      });
    }

    // ── SET ──
    if (action === "set") {
      // Fields that must be stored in Vault, not as plain columns
      const SECRET_FIELDS = new Set([
        "api_key_test", "api_key_live",
        "client_key_test", "client_key_live",
        "hmac_key",
      ]);
      const updates: Record<string, any> = {};
      const vaultWrites: Array<{ field: string; value: string }> = [];
      for (const [k, v] of Object.entries(body.fields || {})) {
        if (!ALLOWED_FIELDS.has(k)) continue;
        if (v === "" || v === null || v === undefined) continue;
        const value = String(v).trim();
        if (SECRET_FIELDS.has(k)) {
          vaultWrites.push({ field: k, value });
        } else {
          updates[k] = value;
        }
      }

      // Ensure a config row exists
      const { data: existing } = await adminClient
        .from("venue_payment_config")
        .select("id")
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments")
        .maybeSingle();

      if (!existing) {
        const { error: insErr } = await adminClient
          .from("venue_payment_config")
          .insert({
            venue_id,
            provider: "ordrpayments",
            environment: "test",
            is_active: false,
            ...updates,
          });
        if (insErr) return json({ error: insErr.message }, 400);
      } else if (Object.keys(updates).length > 0) {
        const { error: updErr } = await adminClient
          .from("venue_payment_config")
          .update(updates)
          .eq("id", existing.id);
        if (updErr) return json({ error: updErr.message }, 400);
      }

      // Write secret fields to Vault via SECURITY DEFINER RPC
      for (const { field, value } of vaultWrites) {
        const { error: vErr } = await adminClient.rpc("set_payment_secret", {
          _venue_id: venue_id,
          _field: field,
          _value: value,
        });
        if (vErr) return json({ error: `vault ${field}: ${vErr.message}` }, 400);
        // Also null out any stale plaintext column so it can't drift.
        await adminClient
          .from("venue_payment_config")
          .update({ [field]: null })
          .eq("venue_id", venue_id)
          .eq("provider", "ordrpayments");
      }

      return json({
        success: true,
        updated_fields: [...Object.keys(updates), ...vaultWrites.map(v => v.field)],
      });
    }


    // ── CLEAR a single field ──
    if (action === "clear_field") {
      const field = body.field;
      if (!ALLOWED_FIELDS.has(field)) return json({ error: "Invalid field" }, 400);
      const { error } = await adminClient
        .from("venue_payment_config")
        .update({ [field]: null })
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments");
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-set-payment-credentials error:", err);
    return json({ error: err.message || "Server error" }, 500);
  }
});
