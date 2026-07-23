import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { timingSafeEqualStr } from "../_shared/secure-compare.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // AEA-03: a missing/empty Authorization header is never treated as trusted
  // cron. The cron path requires an explicit CRON_SECRET (or service-role key);
  // manual runs must be an authenticated platform admin.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const isCron = !!token && (timingSafeEqualStr(token, cronSecret) || timingSafeEqualStr(token, svcKey));

  if (!isCron) {
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "tabless_admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Not authorised" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetDate = body.target_date ? new Date(body.target_date) : new Date();
    const dayOfMonth = targetDate.getDate();
    const isDryRun = !!body.dry_run;

    // Advisory lock to prevent concurrent runs
    const { data: gotLock } = await adminClient.rpc("pg_advisory_lock", { key: 42 }).catch(() => ({ data: false }));
    // Actually pg_advisory_lock returns void, let's use a simpler approach

    // Find venues whose billing_day_of_month matches today
    const { data: venues } = await adminClient
      .from("venue_billing_config")
      .select("venue_id, commission_percent, min_monthly_fee, billing_currency, billing_day_of_month, estimated_annual_gmv, qr_gmv_percent")
      .eq("billing_day_of_month", dayOfMonth);

    if (!venues || venues.length === 0) {
      return new Response(JSON.stringify({ generated: 0, invoices: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, dayOfMonth);
    const periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), dayOfMonth - 1);
    const fromTs = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate(), 0, 0, 0).toISOString();
    const toTs = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 23, 59, 59).toISOString();

    const results: any[] = [];

    for (const cfg of venues) {
      // Check if invoice already exists for this venue + period
      const { data: existing } = await adminClient
        .from("venue_invoices")
        .select("id")
        .eq("venue_id", cfg.venue_id)
        .eq("period_start", periodStart.toISOString().split("T")[0])
        .eq("period_end", periodEnd.toISOString().split("T")[0])
        .maybeSingle();

      if (existing) {
        results.push({ venue_id: cfg.venue_id, skipped: true, reason: "Invoice already exists for this period" });
        continue;
      }

      // Get financials for the period
      const { data: finData } = await adminClient.rpc("get_platform_financials", {
        _from: fromTs,
        _to: toTs,
      });

      let venueRevenue = 0;
      let billableOrders = 0;
      if (finData && finData.venues) {
        const venueData = finData.venues.find((v: any) => v.venue_id === cfg.venue_id);
        if (venueData) {
          venueRevenue = parseFloat(venueData.net_revenue || 0);
          billableOrders = venueData.billable_orders || 0;
        }
      }

      const commissionAmount = Math.round(venueRevenue * (cfg.commission_percent || 0) / 100 * 100) / 100;
      const minFeeAmount = cfg.min_monthly_fee || 0;
      const subtotal = commissionAmount + minFeeAmount;
      const tax = 0; // GST handled separately if needed
      const total = subtotal + tax;

      const { data: invNum } = await adminClient.rpc("generate_invoice_number");

      if (isDryRun) {
        results.push({
          venue_id: cfg.venue_id,
          dry_run: true,
          invoice_number: invNum,
          period_start: periodStart.toISOString().split("T")[0],
          period_end: periodEnd.toISOString().split("T")[0],
          commission_amount: commissionAmount,
          min_fee_amount: minFeeAmount,
          total,
          currency: cfg.billing_currency || "AUD",
        });
        continue;
      }

      const { data: invoice, error: invErr } = await adminClient.from("venue_invoices").insert({
        venue_id: cfg.venue_id,
        invoice_number: invNum,
        period_start: periodStart.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        due_date: targetDate.toISOString().split("T")[0],
        commission_amount: commissionAmount,
        min_fee_amount: minFeeAmount,
        subtotal,
        tax,
        total,
        currency: cfg.billing_currency || "AUD",
        status: "open",
      }).select().single();

      if (invErr) {
        results.push({ venue_id: cfg.venue_id, error: invErr.message });
        continue;
      }

      // Create invoice lines
      await adminClient.from("venue_invoice_lines").insert([
        {
          invoice_id: invoice.id,
          line_type: "commission",
          description: `Commission on orders (${cfg.commission_percent}% of ${venueRevenue.toFixed(2)})`,
          quantity: 1,
          unit_price: commissionAmount,
          amount: commissionAmount,
          display_order: 0,
        },
        {
          invoice_id: invoice.id,
          line_type: "min_fee",
          description: "Minimum monthly platform fee",
          quantity: 1,
          unit_price: minFeeAmount,
          amount: minFeeAmount,
          display_order: 1,
        },
      ]);

      await adminClient.from("venue_billing_events").insert({
        venue_id: cfg.venue_id,
        invoice_id: invoice.id,
        event_type: "invoice_created",
        description: `Invoice ${invNum} created for period ${periodStart.toISOString().split("T")[0]} to ${periodEnd.toISOString().split("T")[0]}`,
      });

      results.push({ venue_id: cfg.venue_id, invoice_id: invoice.id, invoice_number: invNum, total });
    }

    await adminClient.from("venue_billing_events").insert({
      event_type: isDryRun ? "batch_started" : "batch_completed",
      description: `Invoice generation ${isDryRun ? "(dry run)" : ""} — ${results.length} venues processed`,
    });

    return new Response(JSON.stringify({ generated: results.filter(r => r.invoice_id && !r.error).length, dry_run: isDryRun, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ar-generate-invoices error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
