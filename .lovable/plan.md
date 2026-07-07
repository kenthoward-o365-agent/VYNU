
## Goal

Replace the thin §14 "Load testing" in the handoff document with a full write-up of the stress testing actually performed in May 2026, the bottleneck we diagnosed, the code-level fixes we shipped, and the final recommendations the dev team should carry forward.

## What I found in the history

Three real k6 runs were executed against the live backend:

1. **Smoke** — 20 VUs, ~5 min. 0 failures. p50 269 ms / p95 515 ms. No app queries in top‑20 slow statements.
2. **Peak v1** — 1,500 VUs, uniform random venue picker. Found the cliff: 17.3% failures, p50 19.6 s, p95 timed out at 60 s. Root cause: Postgres connection saturation on `menu-snapshot` cache misses (0% cache hit because uniform sampling).
3. **Peak v2** — same 1,500 VUs but with the three fixes below + Zipfian venue distribution. Failure rate went to 24.8% — worse, but that is the correct answer: hot‑venue concentration piled dozens of edge isolates onto the same Postgres connections, proving the remaining ceiling is cluster‑wide connection pooling, not code.

Three code‑level optimizations were shipped between v1 and v2:

- `get_menu_snapshot` RPC (migration `20260501163542`) — collapses 6–7 round‑trips into one.
- Per‑isolate single‑flight guard in `supabase/functions/menu-snapshot/index.ts` — coalesces same‑isolate herd.
- Zipfian venue picker + `DISTRIBUTION` env switch in `scripts/loadtest/k6/common.js`, covered by Vitest.

Final recommendation captured in `/mnt/documents/aws-migration-brief-2026-05-01-v2.pdf`: the remaining ceiling is fixable only with cluster‑wide pooling (RDS Proxy / Supavisor transaction mode) + ElastiCache single‑flight — i.e. the AWS migration path already documented for the team.

## Deliverable

New file: `/mnt/documents/OrderNOW-dev-handoff_v2.pdf` (versioned, doesn't overwrite the original).

Same visual style as the source PDF (single‑column, monospace code blocks, section numbering preserved). Regenerated from the source text with §14 rewritten as:

```text
14. Stress testing & results
  14.1 Harness overview        (existing content, kept)
  14.2 Runs executed
        - Smoke   (20 VUs)     table: reqs, fail%, p50, p95, max, verdict
        - Peak v1 (1,500 VUs, uniform)   same columns + diagnosis
        - Peak v2 (1,500 VUs, Zipf + fixes) same columns + diagnosis
  14.3 Diagnosed bottleneck    Postgres connection saturation on menu-snapshot
                                cache misses; per-isolate single-flight cannot
                                coalesce across the edge cluster.
  14.4 Optimizations shipped from stress testing
        - get_menu_snapshot RPC (migration 20260501163542)
        - Per-isolate single-flight in menu-snapshot/index.ts
        - Zipfian venue picker in k6/common.js + Vitest coverage
  14.5 Final recommendations for the dev team
        1. Adopt cluster-wide connection pooling (RDS Proxy or Supavisor
           transaction mode) before targeting >1,500 concurrent diners.
        2. Move single-flight from per-isolate Map to ElastiCache/Redis so
           the whole edge tier collapses on one origin fetch per venue.
        3. Raise CDN s-maxage on menu-snapshot from 30s to 300s once the
           menu-invalidation webhook is wired end-to-end.
        4. Re-run Peak (Zipf) after each infra change; the goal is
           <2% failure at 5,000 VUs, p95 <800 ms.
        5. Never run Peak/Cliff against production without a quiet window
           and explicit sign-off; teardown.sql only removes LOADTEST_* rows.
  14.6 Reference documents (bundled with handoff, /mnt/documents/)
        - loadtest-smoke-2026-05-01.pdf
        - loadtest-peak-2026-05-01.pdf         (v1, pre-fix)
        - loadtest-peak-2026-05-01-v2.pdf      (post-fix + Zipf)
        - aws-migration-brief-2026-05-01-v2.pdf (target architecture)
```

All other sections (1–13, 15–17) are copied through verbatim.

## Technical approach

- Extract the source PDF text with `pdftotext -layout` (already have it at `/tmp/handoff.txt`) and split it into sections by the numbered headings.
- Render the new PDF with `reportlab` using the same conventions as the earlier load‑test and AWS‑migration PDFs in `/mnt/documents/`: cover header, section headings, `Preformatted` for code/ASCII tables, wrapped `Paragraph` cells in tables. No unicode subscripts, `ShadingType`‑equivalent care for tables.
- QA every page via `pdftoppm -jpeg -r 150` → `code--view` before delivering; fix any overflow / clipping / garbled glyphs and re‑run until clean.
- Emit a `<presentation-artifact>` tag for the new PDF at the end.

No app code, migrations, or edge functions are touched — this is a documentation update only.
