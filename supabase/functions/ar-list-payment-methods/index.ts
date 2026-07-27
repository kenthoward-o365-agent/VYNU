import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeErrorResponse } from "../_shared/safe-error.ts";

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

  try {
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      const { data: isStaff } = await adminClient.rpc("is_venue_staff", { _user_id: user.id, _venue_id: venue_id });
      if (!isStaff) {
        return new Response(JSON.stringify({ error: "Not authorised" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: methods } = await adminClient
      .from("venue_payment_methods")
      .select("id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, bank_name, bsb_last4, routing_last4, is_default, is_active, created_at")
      .eq("venue_id", venue_id)
      .eq("is_active", true)
      .order("is_default", { ascending: false });

    const { data: account } = await adminClient
      .from("venue_billing_accounts")
      .select("payment_method_type, default_payment_method_id")
      .eq("venue_id", venue_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      methods: methods || [],
      account_type: account?.payment_method_type,
      default_payment_method_id: account?.default_payment_method_id,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return safeErrorResponse("ar-list-payment-methods", err, corsHeaders);
  }
});
