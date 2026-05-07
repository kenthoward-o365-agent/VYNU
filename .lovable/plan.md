# White Label Foundation for Shyndig

Goal: turn Shyndig into a true multi-tenant white-label platform so any POS vendor (or reseller) can ship the operator console, consumer ordering app, QR codes, and Knowledge Base under their own brand, domain, and copy — without code changes.

This plan covers the foundation. Per-feature copy polish across every page is staged afterwards.

---

## 1. Data model — `white_label_brands`

New table (migration) keyed by **host** (the domain the request comes in on). One row = one brand.

Columns (high level):
- `id uuid pk`, `slug text unique` (e.g. `shyndig`, `posvendor-x`)
- `name text` (display name, e.g. "PosVendor X")
- `is_default boolean` — exactly one row, used as fallback when host doesn't match
- **Hosts**: `app_host text unique` (operator console), `consumer_host text unique` (QR / diner app), `api_host text` (docs only), `marketing_host text`
- **Brand assets**: `logo_primary_url`, `logo_mono_white_url`, `logo_mono_black_url`, `favicon_url`, `app_icon_url`, `og_image_url`
- **Theme**: `theme jsonb` — HSL tokens overriding `src/index.css` variables (primary, accent, sidebar, etc.)
- **Copy**: `product_name text`, `tagline text`, `support_email text`, `support_url text`, `legal_company_name text`, `privacy_url`, `terms_url`
- **Feature toggles**: `show_developers_page bool`, `show_knowledge_base bool`, `show_powered_by bool`, `enabled_pos_providers text[]` (filters Integrations dialog)
- **Knowledge base**: `kb_overrides jsonb` — section-level title/body overrides (sections that aren't overridden fall back to defaults)
- **Auth**: `auth_email_from text`, `auth_email_reply_to text` (passed to email infra)
- `created_at`, `updated_at`

RLS:
- `select` — public (the site needs it before login).
- `insert/update/delete` — `tabless_admin` only.

Add nullable `white_label_brand_id uuid` to `venues` so a venue can be **pinned** to a brand for QR generation; falls back to the venue's group brand or platform default.

Seed Shyndig as the default brand.

## 2. Brand resolution

New helper `src/lib/white-label.ts`:
```ts
export async function resolveBrandByHost(host: string): Promise<Brand>
```
- Match `app_host` or `consumer_host` exactly.
- Fall back to `is_default = true`.
- Cached in memory + localStorage; invalidated on version bump.

New `BrandProvider` (`src/contexts/BrandContext.tsx`) wraps the app at the very top of `App.tsx` (above `RootRoutes`). Exposes `useBrand()` returning `{ brand, surface }` where `surface` is `'operator' | 'consumer'` based on host.

On mount it:
1. Resolves brand from `window.location.host`.
2. Injects CSS variables from `theme` into `:root` (override the tokens in `src/index.css`).
3. Sets `<title>`, `<link rel="icon">`, `<meta name="theme-color">`, OpenGraph tags.
4. Stores brand in context for components to read.

## 3. QR code & deep-link URLs (CRITICAL — preserve memory rule)

Memory says QR URLs are **permanent stickers**: existing `https://shyndig.lovable.app/order/{venueId}/{tableId}` URLs must keep working. We do NOT regenerate.

Approach:
- `PUBLISHED_BASE_URL` in `src/pages/Tables.tsx` becomes a function:
  `getQrBaseUrl(venue)` → returns the **brand's `consumer_host`** for the venue's pinned brand if set; otherwise returns `https://shyndig.lovable.app` (unchanged default).
- New venues under a non-default brand emit QR URLs on that brand's host.
- Existing Shyndig stickers continue to resolve at `shyndig.lovable.app`.
- The consumer route `/order/:venueId/:tableId` is host-agnostic — same code, different brand applied via `BrandProvider`.

Add a "Brand" column to `Tables` so operators can confirm what host their printed QR will use before printing.

## 4. Themed UI surface

- `src/index.css` already uses HSL CSS variables. Brand `theme` JSON keys map 1:1 to the variables (`--primary`, `--accent`, `--sidebar-*`, etc.). Unset keys keep defaults.
- Replace hard-coded logo `<img src="/brand/shyndig-icon.png">` in `DashboardLayout.tsx` with `<img src={brand.logo_primary_url}>`. Same for Auth, Onboarding, ResetPassword, ConsumerLayout, Receipt, VenueLanding, AIChatOverlay header.
- Replace literal "Shyndig" strings with `{brand.product_name}` in all 30+ files identified in the audit (Auth header, footers, toasts, email copy, Knowledge Base headings, Developers page, ReceiptView, etc.). Done as a sweep after the foundation lands.
- "Powered by Shyndig" small-print footer shown only when `brand.show_powered_by`.

## 5. Knowledge Base & Developers white-labeling

- `KnowledgeBase.tsx` renders sections from a config array. For each section, if `brand.kb_overrides[sectionId]` exists, use the override `{ title?, body? }`; otherwise default text.
- Hide `/knowledge-base` nav link when `brand.show_knowledge_base = false`.
- Hide `/developers` route entirely when `brand.show_developers_page = false`. API docs `api_host` and partner contact email come from brand.

## 6. POS provider filtering

`IntegrationsSettingsTab` and `PosConnectDialog` already list providers from `pos_providers`. Filter the list by `brand.enabled_pos_providers` so a vendor only sees their own POS (or whatever subset they re-sell).

## 7. Admin White Label page

New route `/admin/white-label` (admin only), two tabs:

**Brands list** — table of brands, columns: name, app host, consumer host, default, # venues. Actions: Create, Edit, Set default.

**Brand editor** (modal/drawer):
- Identity: name, slug, hosts (app, consumer, api, marketing)
- Brand assets: upload logo set, favicon, app icon, OG image (uses existing `venue-assets` bucket under `white-label/{slug}/`)
- Theme: color pickers for primary, accent, sidebar bg/fg, with a live preview pane
- Copy: product name, tagline, support email, legal company, privacy/terms URLs
- Toggles: show Developers, show Knowledge Base, show "Powered by", POS provider multi-select
- Knowledge Base overrides: section picker + rich text editor for per-section overrides
- Auth email from/reply-to

New nav entry under Admin: "White Label" (gear icon) — visible to `tabless_admin` only.

A small "Pin venue to brand" control on `AdminVenueDetail` so admins can move a venue between brands without touching SQL.

## 8. DNS / hosting

White-label hosts are real custom domains added via Lovable's existing custom-domain flow. Each vendor's domain is connected once in Project Settings → Domains, then registered as a brand row. We document this in the Admin White Label intro panel with a link to the docs.

## 9. Out of scope (this round)

- Per-brand auth providers (e.g. white-label Google OAuth client) — needs Supabase Auth multi-config; deferred.
- Per-brand outbound transactional email templates — scaffold hooks but actual template editor is a follow-up.
- Per-brand billing/Stripe accounts — deferred.

---

## Technical notes

- Files added: `supabase/migrations/<ts>_white_label_brands.sql`, `src/lib/white-label.ts`, `src/contexts/BrandContext.tsx`, `src/pages/AdminWhiteLabel.tsx`, `src/components/admin/BrandEditorDialog.tsx`.
- Files edited: `src/App.tsx` (wrap with `BrandProvider`, inject head tags), `src/pages/Tables.tsx` (host resolver), `src/components/DashboardLayout.tsx` (logo + product name + nav filtering), `src/pages/KnowledgeBase.tsx` (override-aware), `src/pages/Developers.tsx` (brand-aware copy + toggle), `src/components/venue/IntegrationsSettingsTab.tsx` + `PosConnectDialog.tsx` (provider filter), plus the brand-string sweep across consumer/operator components.
- The `BrandProvider` runs **before** `AuthProvider` so auth screens are already themed.
- Caching: brand is fetched once per session via React Query with a 10-min stale time; an admin "Save" invalidates it via realtime broadcast on a `white_label_brands` channel so connected operator tabs re-theme without reload.
- QR memory constraint preserved: default brand keeps `shyndig.lovable.app`; new brands only affect newly generated QR URLs for venues pinned to them.

---

## Suggested execution order

1. Migration + seed Shyndig as default brand.
2. `BrandContext` + theme/head injection (no UI changes visible yet — Shyndig defaults still apply).
3. Logo / product-name sweep across operator + consumer surfaces.
4. QR host resolver in `Tables.tsx` + Brand column.
5. Knowledge Base + Developers gating and overrides.
6. POS provider filter.
7. Admin White Label page (list + editor + venue pinning).
8. Docs panel explaining custom-domain setup per brand.