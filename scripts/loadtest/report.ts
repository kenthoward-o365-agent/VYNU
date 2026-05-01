/**
 * Reads the JSON summary k6 emits with `--summary-export=summary.json`,
 * pulls the slow-query top-20 from pg_stat_statements, and writes a
 * markdown report to /mnt/documents/loadtest-<date>.md.
 *
 * Usage:
 *   bun run scripts/loadtest/report.ts --summary out/summary.json --label peak
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const summaryPath = args.get("summary");
const label = args.get("label") ?? "run";
if (!summaryPath) {
  console.error("--summary <path> required");
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const m = summary.metrics ?? {};

function p(metricName: string, key: string) {
  const v = m[metricName]?.values?.[key] ?? m[metricName]?.[key];
  return v ?? "n/a";
}
function fmt(n: any, suffix = "") {
  return typeof n === "number" ? `${n.toFixed(1)}${suffix}` : String(n);
}

const lines: string[] = [];
lines.push(`# Load test report — ${label}`);
lines.push(`Generated ${new Date().toISOString()}\n`);
lines.push(`## Headline numbers`);
lines.push(`- HTTP requests: ${p("http_reqs", "count")}`);
const failRate = p("http_req_failed", "rate");
lines.push(`- Failure rate: ${typeof failRate === "number" ? (failRate * 100).toFixed(2) + "%" : failRate}`);
lines.push(`- Duration p50: ${fmt(p("http_req_duration", "med"), " ms")}`);
lines.push(`- Duration p95: ${fmt(p("http_req_duration", "p(95)"), " ms")}`);
lines.push(`- Duration p90: ${fmt(p("http_req_duration", "p(90)"), " ms")}`);
lines.push(`- Duration max: ${fmt(p("http_req_duration", "max"), " ms")}`);
lines.push(`- Iterations: ${p("iterations", "count")}\n`);

if (admin) {
  lines.push(`## Top 20 slow queries (pg_stat_statements)`);
  const { data, error } = await admin.rpc("loadtest_top_queries" as any);
  if (error || !data) {
    lines.push(`_unable to fetch: ${error?.message ?? "no data"}_`);
  } else {
    lines.push(`| calls | mean ms | p95 ms | query |`);
    lines.push(`|------:|--------:|-------:|-------|`);
    for (const r of data as any[]) {
      lines.push(
        `| ${r.calls} | ${Number(r.mean_ms).toFixed(1)} | ${Number(r.p95_ms).toFixed(1)} | \`${String(r.query).slice(0, 120).replace(/\|/g, "\\|")}\` |`,
      );
    }
  }
} else {
  lines.push(`## DB top-queries skipped — set SUPABASE_SERVICE_ROLE_KEY to include`);
}

mkdirSync("/mnt/documents", { recursive: true });
const out = `/mnt/documents/loadtest-${label}-${new Date().toISOString().slice(0, 10)}.md`;
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Wrote ${out}`);
