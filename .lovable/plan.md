
# Packages: Bite · Plate · Feast

Three sellable tiers with an on/off feature-flag matrix underneath. Presets seed the tier, but every flag can be overridden per venue so we can still sell bespoke bundles.

## Positioning

- **Bite** — the essentials to actually run a venue on OrderNOW. QR ordering, menu, tables, orders, H&L Pay, taxes, basic AI ordering. Solo operators / single site.
- **Plate** — everything in Bite plus richer merchandising, diner capture, loyalty, POS push, group tooling for small groups.
- **Feast** — full platform: CRM campaigns (email/SMS/push), AI campaign composer, advanced analytics, multi-venue group loyalty, developer/API access, white-label landing pages, priority AI features.

AI ordering (Spark chat + upsell) is in **all three tiers**. What differs is *how far* AI reaches — Feast unlocks AI campaign generation, AI menu-image batch, AI insights, and AI co-pilot walkthroughs beyond the basics.

## Feature grid

Legend: ● included · ○ not included · △ limited

| # | Capability | Bite | Plate | Feast |
|---|---|:---:|:---:|:---:|
| **Core ordering** ||||
| 1 | Menu builder (categories, items, modifiers) | ● | ● | ● |
| 2 | Tables + permanent QR stickers | ● | ● | ● |
| 3 | Orders board + status flow | ● | ● | ● |
| 4 | Order statuses (default set) | ● | ● | ● |
| 5 | Custom order statuses | ○ | ● | ● |
| 6 | Order throttling & kitchen pacing | ○ | ● | ● |
| 7 | Display terminals / KDS areas | △ 1 area | ● | ● |
| 8 | Session modes (dine-in / takeaway / pickup) | △ dine-in only | ● | ● |
| **Payments (H&L Pay)** ||||
| 9 | H&L Pay checkout, Apple/Google Pay, stored cards | ● | ● | ● |
| 10 | Surcharging config | ● | ● | ● |
| 11 | Refunds & re-open orders | ● | ● | ● |
| 12 | Gratuities / tipping | ○ | ● | ● |
| 13 | Tax rules (multi-rate, item-level) | △ single GST | ● | ● |
| **AI** ||||
| 14 | Spark AI chat ordering | ● | ● | ● |
| 15 | AI upsell / cart suggestions | ● | ● | ● |
| 16 | AI menu import from URL/PDF | ○ | ● | ● |
| 17 | AI menu image generation (single) | ○ | ● | ● |
| 18 | AI menu image batch generator | ○ | ○ | ● |
| 19 | AI modifier generation | ○ | ● | ● |
| 20 | Spark AI Analytics (chat perf, conversion) | ○ | ● | ● |
| 21 | AI Insights (daily narrative, anomalies) | ○ | ○ | ● |
| 22 | AI Co-pilot (in-app walkthroughs + chat) | △ onboarding only | ● | ● |
| 23 | AI campaign composer (subject/body/SMS) | ○ | ○ | ● |
| **Diners & CRM** ||||
| 24 | Diner profiles + visit history | ● | ● | ● |
| 25 | Diner preferences (allergens, favourites) | ● | ● | ● |
| 26 | RFM & AI lookalike segments | ○ | △ RFM only | ● |
| 27 | Email campaigns | ○ | ○ | ● |
| 28 | SMS campaigns (incl. SMS-subscribers audience) | ○ | ○ | ● |
| 29 | Push / in-app campaigns | ○ | ○ | ● |
| 30 | Suppression list & STOP handling | ○ | ○ | ● |
| 31 | Campaign attribution to revenue | ○ | ○ | ● |
| **Loyalty** ||||
| 32 | Single-venue loyalty program | ○ | ● | ● |
| 33 | Multi-venue / group loyalty | ○ | ○ | ● |
| 34 | Birthday rewards + auto-issue | ○ | ● | ● |
| **Merchandising & pricing** ||||
| 35 | Pricing rules (happy hour, member price) | ○ | ● | ● |
| 36 | Custom rule types | ○ | ○ | ● |
| 37 | Menu time frames (breakfast/lunch/dinner) | ○ | ● | ● |
| 38 | Multiple display areas (bar / bistro / kids) | ○ | ● | ● |
| 39 | White-label venue landing page editor | ○ | △ theme only | ● full sections |
| **POS & integrations** ||||
| 40 | H&L Exceed POS push | ○ | ● | ● |
| 41 | POS menu pull / product sync | ○ | ● | ● |
| 42 | Other POS adapters | ○ | ○ | ● |
| 43 | Developer API keys + webhooks | ○ | ○ | ● |
| 44 | Partner CRM export | ○ | ○ | ● |
| **Multi-venue / group** ||||
| 45 | Group dashboard (roll-up) | ○ | △ 2 venues | ● unlimited |
| 46 | Cross-venue staff & roles | ○ | ● | ● |
| 47 | Per-user Orders permissions (status/reopen/refund) | ● | ● | ● |
| 48 | Custom roles + permission matrix | ○ | ● | ● |
| **Reporting & analytics** ||||
| 49 | Core dashboard (revenue, orders, top items) | ● | ● | ● |
| 50 | Revenue by hour, ticket times, table utilisation | ○ | ● | ● |
| 51 | Advanced Reporting page (exports, custom range) | ○ | △ view only | ● full + exports |
| 52 | Abandonment / funnel analytics | ○ | ○ | ● |
| **Ops & platform** ||||
| 53 | Self-onboarding wizard + readiness | ● | ● | ● |
| 54 | Knowledge Base (in-app) | ● | ● | ● |
| 55 | Priority support SLA | ○ | ○ | ● |

Anything not called out (Auth, billing setup, security, PCI scope, QR permanence, admin surfaces) is platform-level and shipped to every tier by default.

## Admin gating UX

New page: `/admin/venues/:venueId` → **Package & features** tab.

```text
┌─ Package ────────────────────────────────────────────┐
│ ( ) Bite     ( ) Plate    (●) Feast    ( ) Custom    │
│ [Apply preset]   Preset last applied: 7 Jul 2026     │
└──────────────────────────────────────────────────────┘

┌─ Feature flags (grouped) ────────────────────────────┐
│ Core ordering                                        │
│   [x] Custom order statuses                          │
│   [x] Order throttling                               │
│   ...                                                │
│ AI                                                   │
│   [x] AI campaign composer                           │
│   [ ] AI insights                                    │
│ ...                                                  │
│                                                      │
│ Selecting a preset ticks the matching boxes; any     │
│ manual change flips the tier to "Custom" and is      │
│ saved as an override.                                │
└──────────────────────────────────────────────────────┘
```

Behaviour:
- Presets are pure client-side templates that stamp the flag set. They don't lock anything.
- Any deviation from a preset flips the venue to `custom` but keeps the flags. Re-applying a preset overwrites overrides (with a confirm).
- Read-only view of the same grid is surfaced to venue owners on their Billing page so they can see what's included and what to upgrade for.

## Technical shape (for the follow-up build turn)

1. **DB** — new `venue_feature_flags` table (`venue_id` PK, one boolean column per feature key, `tier` text, `updated_at`). Migration includes `GRANT`s + RLS: venue staff read own; `tabless_admin` write; service_role all.
2. **Presets** — TypeScript constant `PACKAGE_PRESETS: Record<'bite'|'plate'|'feast', Partial<FeatureFlags>>` in `src/lib/packages.ts`. Single source of truth used by both the admin editor and any seeding.
3. **Client hook** — `useFeatures()` reads flags from `VenueContext` (added to the existing venue query). Returns `{ has(key), tier }`.
4. **Gating helpers** —
   - `<FeatureGate feature="crm.email_campaigns">…</FeatureGate>` wrapper (renders upgrade CTA when off).
   - Hide/disable sidebar entries in `DashboardLayout` when the corresponding feature is off.
5. **Server enforcement** — edge functions that spend money or send messages (`crm-send-campaign`, `batch-generate-images`, `ai-insights`, `pos-order-push`, `partner-*`) check the flag server-side and return 403 with a clear code when off. UI gating alone is not enough.
6. **Rollout** — default every existing venue to `feast` = all-on so nothing breaks; admins downgrade as contracts land.

## What's not in this plan

- No pricing numbers, no billing/invoicing changes, no Stripe/Paddle wiring — this is packaging + gating only. Billing tier hooks in later once we're happy with the grid.
- No consumer-facing copy changes.
- No changes to auth, RLS on unrelated tables, or the marketing site.

## Open questions before we build

1. Are the tier assignments above right, or do you want to move specific rows (call them out by #)?
2. For the "limited" rows (△), keep the caps as written or drop them (simpler = pure on/off)?
3. Should the venue-facing Billing page show the full grid with locked rows, or only what's included?
