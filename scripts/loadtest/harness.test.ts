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
    // Every DELETE in the file must be scoped to LOADTEST.
    const deletes = sql.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(d, `unscoped DELETE: ${d}`).toMatch(/LOADTEST_/);
    }
  });
});
