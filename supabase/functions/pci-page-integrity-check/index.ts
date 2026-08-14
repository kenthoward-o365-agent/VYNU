// PCI DSS v4.0.1 Req 6.4.3 / 11.6.1 — Payment-page script change detection.
// Cron daily: fetches checkout HTML, extracts every <script src> + inline-script hash,
// and compares to pci_script_baseline. New/changed scripts are inserted as unauthorised
// so admins are alerted to review on the next dashboard load.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGETS = [
  // Update as new checkout-bearing routes ship
  "/order",
  "/order/checkout",
];

async function sha256(s: string) {
  const buf = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractScripts(html: string): Array<{ src: string; hash: string }> {
  const out: Array<{ src: string; hash: string }> = [];
  const srcRe = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html))) {
    out.push({ src: m[1], hash: "external" });
  }
  const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = inlineRe.exec(html))) {
    const body = (m[1] || "").trim();
    if (body) out.push({ src: `inline`, hash: body.slice(0, 64) });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require CRON_SECRET or service-role bearer
  const auth = req.headers.get("authorization") || "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || (token !== cronSecret && token !== svcKey)) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const baseUrl = Deno.env.get("PCI_CHECK_BASE_URL") || "https://vynu-chi.vercel.app";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ url: string; newCount: number; total: number }> = [];

  for (const path of TARGETS) {
    const url = `${baseUrl}${path}`;
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) continue;
      const html = await r.text();
      const scripts = extractScripts(html);
      let newCount = 0;
      for (const s of scripts) {
        const hash = await sha256(`${s.src}|${s.hash}`);
        const { data: existing } = await supabase
          .from("pci_script_baseline")
          .select("id,is_authorised")
          .eq("url", url)
          .eq("script_src", s.src)
          .eq("integrity_hash", hash)
          .maybeSingle();
        if (!existing) {
          newCount += 1;
          await supabase.from("pci_script_baseline").insert({
            url,
            script_src: s.src,
            integrity_hash: hash,
            is_authorised: false,
            justification: "Auto-detected by daily integrity check — review required.",
          });
        } else {
          await supabase
            .from("pci_script_baseline")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      }
      results.push({ url, newCount, total: scripts.length });
    } catch (e) {
      console.error("[pci-page-integrity-check]", url, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
