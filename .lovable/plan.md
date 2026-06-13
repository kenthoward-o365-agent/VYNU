## Goal

Turn the Knowledge Base from a feature *index* into a true operator manual. Today some sections (Display Terminals, Throttling, POS Integration, Orders) are deep and useful; others (Landing Page Editor, Pricing, Loyalty, H&L OrderNOW AI, Taxes, Dashboard, Analytics, Diners overview, Menu AI features) are one- or two-paragraph blurbs that don't explain *how* to actually use the feature.

The user called out Landing Page Editor as the worst example: it doesn't even mention the **Build from website** flow, the **Theme panel**, individual **section types**, the **mobile preview**, or how to publish — even though all of that exists in `src/components/landing-editor/`.

## Approach

For each "thin" section, read the actual feature code (pages + components) so the doc reflects what's really there — buttons, dialogs, field names, defaults — then rewrite the KB section using the same structure the strong sections already use:

- **What it is / where to find it** (one paragraph + nav path)
- **Setup walkthrough** (numbered `StepList` — first-time setup)
- **Every sub-feature** (one `SubSection` per major capability, with the exact button/menu names)
- **Day-to-day management** (editing, reordering, disabling, deleting)
- **Tips / gotchas / permissions** as `<Tip>` and bullets
- **Troubleshooting table** when relevant (Symptom → Cause → Fix)

Keep the existing TOC IDs and section order — only the *content inside* each `<Section>` changes. No new routes, no schema changes, no behaviour changes.

## Sections to expand (priority order)

1. **Landing Page Editor** *(highest priority — user's example)*
   Cover: opening the editor from Settings, the three-pane layout (Section list / Edit panel / Mobile preview), **Build from website** dialog (URL + Replace vs Append + what gets scraped: colours, fonts, address, content), **Add Section** modal and every section type (Hero, Table Display, Featured Items, Loyalty CTA, Hours & Location, Social Links, Text, Divider, Spacer), the **Theme panel** (background incl. gradients, accent, surface, border, text colours, heading + body font pickers), per-section overrides, reordering, deleting, mobile-frame preview, save & publish, how the page maps to the QR-scan landing URL.

2. **Pricing**
   Expand each rule type with real-world examples, explain the stacking math, time-window editor, day-of-week selector, active toggle behaviour, how rules interact with modifiers and AI upsells, who can manage them.

3. **Settings → Loyalty** (currently 4 steps)
   Programme types in detail (Points / Stamps / Tier), earn rules, redemption rules, tier thresholds, expiry, child-venue / group loyalty, diner-facing prompts (join, tier-up), how loyalty appears in CRM segments.

4. **Settings → H&L OrderNOW AI**
   Agent name/tone/opening, venue context best practices, agent icon upload, AI guardrails (max discount, quiet hours, daily caps — cross-link to CRM), how the agent appears on the diner screen, testing the agent.

5. **Settings → Payments (H&L Pay)**
   Expand existing onboarding flow, add Settlement schedule, refunds, chargebacks/disputes, surcharges, gratuities, statement descriptor rules, switching Test ↔ Live, what to verify before going live.

6. **Settings → Taxes**
   Add a worked GST example (inclusive vs exclusive), per-category overrides, how taxes appear on the diner receipt and POS push, audit reports.

7. **Settings → Users & Roles**
   Already strong on the two-layer model — add a step-by-step "Create a new role" walkthrough and a "Day in the life" matrix of common Australian hospitality roles.

8. **Dashboard**
   Document every tile and chart explicitly, how the date picker works, comparison mode, AI-revenue attribution badge, how to drill from a chart to the underlying orders.

9. **Spark AI Analytics**
   List every chart, define each metric precisely, explain attribution windows, what "good" looks like, how to act on each insight.

10. **Analytics**
    Date range presets, export options, item/category drill-down, comparison periods, how throttling affects analytics, ROI of pricing rules and campaigns.

11. **Diners — CRM** (already long, but light on *how-to*)
    Add walkthroughs: create a segment from scratch, send a one-off campaign, schedule a recurring birthday campaign, interpret RFM tiers, handle unsubscribes, import existing diners.

12. **Menu Builder — AI features**
    Expand AI Import (file size limits, what gets extracted, how to fix mis-reads), Enhance Images (before/after expectations, cost), Generate Images (prompt tips), Display Areas (how items route to kitchen vs bar), POS ID field (links to POS integration section).

13. **Tables & QR**
    Add: zones, capacity, bulk add, reprinting stickers, what happens when a table is deleted (sessions, history), QR sticker design tips, dine-in vs takeaway sessions.

14. **Orders** (already strong) — small additions only: filtering by Display Area, sorting, search, exporting, what each badge means at a glance.

15. **Getting Started**
    Tighten the checklist so each step links (via the TOC anchor pattern) to the expanded section that explains it in depth.

## Out of scope

- No new pages, components, routes, schema or backend changes.
- No changes to the TOC list or section IDs (preserves the in-page search and Co-Pilot deep links).
- The Admin Knowledge Base (`/admin/knowledge-base`) is unrelated — it's the compliance document library, not user docs, and isn't touched.

## Delivery

A single edit pass on `src/pages/KnowledgeBase.tsx`. Estimated final size ~2,200–2,500 lines (currently 1,043). Each newly expanded section will use the existing `Section` / `SubSection` / `StepList` / `Tip` primitives, so layout and dark-mode styling stay consistent and the existing in-page search keeps working out of the box.
