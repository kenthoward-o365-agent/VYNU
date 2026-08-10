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

// Secret fields. These are NOT columns on venue_payment_config — they are logical
// field names understood by the set_payment_secret / get_payment_secret RPCs, which
// store the value in Vault and record the reference in `<field>_secret_id`. The
// matching plaintext columns were dropped once everything moved to Vault, so any
// query naming them fails the whole statement with 42703.
const SECRET_FIELDS = new Set([
  "api_key_test",
  "api_key_live",
  "client_key_test",
  "client_key_live",
  "hmac_key",
]);

// Plain (non-secret) columns the admin can set directly on venue_payment_config.
const PLAIN_FIELDS = new Set([
  "merchant_account",
  "apple_pay_merchant_id",
  "google_pay_merchant_id",
]);

// Allowed credential / config fields the admin can set.
// Anything not in this list is silently ignored.
const ALLOWED_FIELDS = new Set([...SECRET_FIELDS, ...PLAIN_FIELDS]);

// Vault reference column backing each secret field.
const secretIdColumn = (field: string) => `${field}_secret_id`;

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
      const { data: config, error: getErr } = await adminClient
        .from("venue_payment_config")
        .select(
          "id, environment, merchant_account, merchant_status, api_key_test_secret_id, api_key_live_secret_id, client_key_test_secret_id, client_key_live_secret_id, hmac_key_secret_id, apple_pay_merchant_id, google_pay_merchant_id"
        )
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments")
        .maybeSingle();

      // Never swallow this: a failed read here is indistinguishable from "nothing
      // configured" in the UI, which previously made saved credentials silently
      // render as "Not set".
      if (getErr) {
        console.error("[admin-set-payment-credentials] get failed", getErr);
        return json({ error: "Failed to read configuration" }, 500);
      }

      if (!config) {
        return json({ exists: false, environment: "test", fields: {} });
      }

      // A secret is "set" iff its Vault reference is present.
      const presence = (vaultId: string | null) =>
        (vaultId ? { set: true, preview: "vault" } : { set: false });

      const fields: Record<string, { set: boolean; preview?: string }> = {};
      for (const field of SECRET_FIELDS) {
        fields[field] = presence((config as any)[secretIdColumn(field)]);
      }

      return json({
        exists: true,
        environment: config.environment,
        merchant_status: config.merchant_status,
        merchant_account: config.merchant_account || "",
        apple_pay_merchant_id: config.apple_pay_merchant_id || "",
        google_pay_merchant_id: config.google_pay_merchant_id || "",
        fields,
      });
    }


    // ── SET ──
    if (action === "set") {
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
      const { data: existing, error: existingErr } = await adminClient
        .from("venue_payment_config")
        .select("id")
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments")
        .maybeSingle();

      // A failed lookup must not be read as "no row" — that would attempt an insert
      // and surface as a misleading unique-violation.
      if (existingErr) {
        console.error("[admin-set-payment-credentials] existing lookup failed", existingErr);
        return json({ error: "Failed to save configuration" }, 500);
      }

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
        if (insErr) { console.error("[admin-set-payment-credentials] insert failed", insErr); return json({ error: "Failed to save configuration" }, 400); }
      } else if (Object.keys(updates).length > 0) {
        const { error: updErr } = await adminClient
          .from("venue_payment_config")
          .update(updates)
          .eq("id", existing.id);
        if (updErr) { console.error("[admin-set-payment-credentials] update failed", updErr); return json({ error: "Failed to save configuration" }, 400); }
      }

      // Write secret fields to Vault via SECURITY DEFINER RPC
      for (const { field, value } of vaultWrites) {
        const { error: vErr } = await adminClient.rpc("set_payment_secret", {
          _venue_id: venue_id,
          _field: field,
          _value: value,
        });
        if (vErr) {
          console.error(`[admin-set-payment-credentials] vault write failed for ${field}`, vErr);
          return json({ error: "Failed to store secret" }, 400);
        }

        // set_payment_secret writes `<field>_secret_id` but does not report how many
        // rows it touched, so confirm the reference actually landed on the row this
        // function reads back. Without this a provider mismatch leaves an orphaned
        // Vault secret and the field still reads as "Not set".
        const { data: check, error: checkErr } = await adminClient
          .from("venue_payment_config")
          .select(secretIdColumn(field))
          .eq("venue_id", venue_id)
          .eq("provider", "ordrpayments")
          .maybeSingle();
        if (checkErr || !check || !(check as any)[secretIdColumn(field)]) {
          console.error(
            `[admin-set-payment-credentials] secret ref not persisted for ${field}`,
            checkErr
          );
          return json({ error: "Failed to store secret" }, 400);
        }
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
      // Secret fields only exist as a Vault reference column; the plaintext column
      // is gone, so naming it here would fail the whole UPDATE.
      const patch: Record<string, any> = SECRET_FIELDS.has(field)
        ? { [secretIdColumn(field)]: null }
        : { [field]: null };
      const { error } = await adminClient
        .from("venue_payment_config")
        .update(patch)
        .eq("venue_id", venue_id)
        .eq("provider", "ordrpayments");
      if (error) {
        console.error("[admin-set-payment-credentials] clear_field failed", error);
        return json({ error: "Failed to clear field" }, 400);
      }
      return json({ success: true });
    }


    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-set-payment-credentials error:", err);
    return json({ error: "Server error" }, 500);
  }
});
