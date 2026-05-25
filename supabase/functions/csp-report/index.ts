// CSP violation collector — PCI DSS v4.0.1 Req 6.4.3 / 11.6.1
// Publicly callable (browsers post here automatically). Stores reports in pci_script_baseline
// with is_authorised=false so admins can review unexpected scripts on the payment page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const report = body?.["csp-report"] ?? body ?? {};
    const url: string = (report["document-uri"] || report.documentURL || "unknown").toString().slice(0, 500);
    const blocked: string = (report["blocked-uri"] || report.blockedURL || "inline").toString().slice(0, 500);
    const directive: string = (report["violated-directive"] || report.effectiveDirective || "").toString().slice(0, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Hash the blocked URI for stable upsert
    const buf = new TextEncoder().encode(`${blocked}|${directive}`);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

    await supabase.from("pci_script_baseline").upsert(
      {
        url,
        script_src: blocked,
        integrity_hash: hash,
        is_authorised: false,
        justification: `CSP violation: ${directive}`,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "url,script_src,integrity_hash" },
    );

    return new Response("ok", { status: 204, headers: corsHeaders });
  } catch (e) {
    console.error("[csp-report] failed", e);
    return new Response("error", { status: 200, headers: corsHeaders });
  }
});
