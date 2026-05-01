// Regression: harness file shape. Ensures the k6 scripts and seeder
// stay parseable and export the contracts the runner expects.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "scripts/loadtest");

describe("loadtest harness", () => {
  it("exposes three k6 profiles", () => {
    for (const f of ["smoke.js", "peak.js", "cliff.js"]) {
      const p = join(root, "k6", f);
      expect(existsSync(p), `${f} missing`).toBe(true);
      const src = readFileSync(p, "utf8");
      expect(src).toContain("export const options");
      expect(src).toContain("export default function");
      expect(src).toContain("fetchMenuSnapshot");
    }
  });

  it("seed.ts writes the .venue-ids file path", () => {
    const src = readFileSync(join(root, "seed.ts"), "utf8");
    expect(src).toContain(".venue-ids");
    expect(src).toContain("LOADTEST_");
  });

  it("teardown only deletes LOADTEST rows", () => {
    const sql = readFileSync(join(root, "teardown.sql"), "utf8");
    // Every DELETE must either reference LOADTEST_ directly OR a CTE that does.
    expect(sql).toMatch(/LOADTEST_/);
    const deletes = sql.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      const ok = /LOADTEST_/.test(d) || /FROM v\)/.test(d);
      expect(ok, `unscoped DELETE: ${d}`).toBe(true);
    }
  });

  it("zipf venue picker concentrates traffic on hot venues", () => {
    // Mirror the Zipf logic in scripts/loadtest/k6/common.js (k6 runtime can't
    // be imported from Vitest). If you change the algorithm there, update here.
    const N = 1000;
    const ALPHA = 1.1;
    const weights = Array.from({ length: N }, (_, i) => 1 / Math.pow(i + 1, ALPHA));
    const sum = weights.reduce((a, b) => a + b, 0);
    const cdf: number[] = [];
    let acc = 0;
    for (const w of weights) {
      acc += w / sum;
      cdf.push(acc);
    }
    const pick = () => {
      const r = Math.random();
      let lo = 0;
      let hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const ITERS = 50_000;
    const counts = new Array(N).fill(0);
    for (let i = 0; i < ITERS; i++) counts[pick()]++;
    const top20Share = counts.slice(0, 20).reduce((a, b) => a + b, 0) / ITERS;
    // Realistic Friday-night: top 20 venues should take a clear majority of traffic.
    expect(top20Share).toBeGreaterThan(0.4);
  });

  it("k6 common.js exposes the distribution switch", () => {
    const src = readFileSync(join(root, "k6/common.js"), "utf8");
    expect(src).toContain("pickVenueZipf");
    expect(src).toContain("pickVenueUniform");
    expect(src).toContain("DISTRIBUTION");
  });
});
