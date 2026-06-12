## What you're seeing

You're hitting several real gaps in the "Build from website" flow plus existing limits in the editor:

1. **Hero image fit** — image is stamped as a `cover` background with no enforced aspect ratio, so logos/wide banners stretch or get cropped.
2. **Body / page background** — the renderer hard-codes `linear-gradient(135deg, #1a1a2e → #16213e → #0f3460)`. Scraped brand colours never reach it.
3. **Address missing** — Firecrawl only sees what's on the homepage. Hooters' homepage doesn't always show the venue address inline, and we never fall back to a Google Places lookup.
4. **Loyalty CTA "Join Hooters Nation" has no link** — the `LoyaltyCTASection` type literally has no `ctaUrl`/`ctaLabel` field, so neither the AI nor the editor can attach one.
5. **Lost colour / font editing** — the editor only exposes colour controls on `hero` and `table-display`. `featured-items`, `loyalty-cta`, `hours-location`, `social-links`, `text`, `divider` have no colour or font controls at all, and there is no page-level theme (background, accent, font family) anywhere.

## Plan

### A. Page-level theme (new)

Add a single `LandingTheme` stored alongside `sections` so brand colours and fonts apply globally and feed every section by default.

- New shape persisted in `venues.landing_page_html`:
  ```ts
  { theme: LandingTheme, sections: LandingSection[] }
  ```
  (backwards compatible — if the parsed JSON is a bare array, wrap it with a default theme.)
- `LandingTheme` fields:
  - `background`: solid hex OR a `{ from, via?, to, angle }` gradient
  - `surface`: card/panel fill (used by featured-items, loyalty-cta, table-display by default)
  - `border`: subtle border colour
  - `textPrimary`, `textMuted`
  - `accent` (used for table number, loyalty CTA button, links)
  - `fontHeading`, `fontBody` (Google Font names, loaded dynamically via `<link>` injection in `MobilePreviewFrame` and on the consumer landing page)
- New **Theme** entry in the left section list (always pinned at top, not draggable, not deletable) → opens a Theme panel on the right with colour pickers + font pickers + "Apply scraped brand" button.

### B. Section-level colour + font controls (fill the gaps)

Extend each section type with optional override fields; when unset, sections inherit from the theme. Add the matching controls to `SectionEditPanel`:

- `featured-items`: `bgColor`, `cardBgColor`, `cardBorderColor`, `titleColor`, `priceColor`
- `loyalty-cta`: `bgColor`, `borderColor`, `headingColor`, `descriptionColor`, plus **new** `ctaLabel`, `ctaUrl` (renders as a real `<a>` button when both present)
- `hours-location`: `bgColor`, `headingColor`, `textColor`, plus `mapUrl` (optional Google Maps deep-link)
- `social-links`: `iconColor`, `iconHoverColor`
- `text`: `color`, `align` ("left"|"center"|"right"), `weight`
- `divider`: `color`, `thickness`
- `hero`: keep existing, plus optional `overlayOpacity` (0–0.8) for image readability

All colour fields use the existing colour-picker + hex input pattern already in the panel.

### C. Renderer changes (`LandingSectionRenderer.tsx`)

- Accept `theme` prop; remove the hard-coded gradient and use `theme.background` (solid or gradient) for the wrapper.
- Inject Google Fonts via a `<link>` tag (`fontHeading`, `fontBody`) and apply via inline `style={{ fontFamily }}` so it works inside the iframe preview.
- Each section reads its own override first, then falls back to theme tokens.
- **Hero image fit fix**: replace the background-image div with a layered `<img>` inside `relative aspect-[16/9] md:aspect-[21/9] max-h-[60vh]` using `object-cover object-center`, plus an overlay tied to `overlayOpacity`. This guarantees the hero never overflows the screen and the focal point stays visible at any width.
- **Loyalty CTA** renders an `<a href={ctaUrl} target="_blank" rel="noopener">` styled as a button when `ctaUrl` is present.

### D. Better scraping in `landing-from-url` edge function

1. **Hero image selection** — pick in this order: `branding.images.ogImage` → first large content image whose URL doesn't look like a logo/favicon/icon → omit (fall back to `bgColor` + `logoEmoji`). Never pass a logo URL as `heroImageUrl`. Log the chosen URL.
2. **Apply brand to theme** — return a `theme` object alongside `sections`:
   - `background` = `branding.colors.background` (or darken `primary` if light)
   - `accent` = `branding.colors.primary`
   - `surface` / `border` derived from `background` with opacity
   - `fontHeading` / `fontBody` = first two of `branding.fonts[].family`
3. **Address lookup fallback** — if `extracted.address` is empty after Firecrawl, call **Google Places Text Search** (`https://places.googleapis.com/v1/places:searchText`) with the venue name + page title and pick the top result; use its `formattedAddress`, `googleMapsUri`, `regularOpeningHours.weekdayDescriptions`, `nationalPhoneNumber`. This populates `hours-location` reliably and gives us a real `mapUrl`. Requires a new secret `GOOGLE_PLACES_API_KEY` — I'll prompt you to add it before deploying.
4. **Loyalty CTA URL** — instruct the AI to set `ctaUrl` when the scraped page or links list contains an obvious loyalty/signup link (e.g. "Hooters Nation", "Rewards", "Join", "Sign up"). Pass the page's `links` array to the model so it can choose the right URL.
5. **Tighter system prompt** — enumerate the new theme + section override fields, forbid using logo as hero image, require Australian spelling, and require `ctaUrl` when proposing a loyalty CTA.

### E. Backwards compatibility

- `parseSections` becomes `parseLanding(raw)` → `{ theme, sections }`. Legacy array payloads get wrapped with a sensible default theme matching today's dark gradient so existing landing pages don't visually change.
- `handleSave` writes the new `{ theme, sections }` object.

### Files

- `src/components/landing-editor/types.ts` — add `LandingTheme`, extend section interfaces, update `createDefaultSection`, add `createDefaultTheme`.
- `src/components/landing-editor/LandingSectionRenderer.tsx` — accept `theme`, new hero layout, per-section theming, font injection.
- `src/components/landing-editor/SectionEditPanel.tsx` — new colour/font controls per section, CTA URL field on loyalty.
- `src/components/landing-editor/ThemeEditPanel.tsx` (new) — page-level theme editor.
- `src/components/landing-editor/SectionList.tsx` — pin a non-draggable "🎨 Theme" entry at top.
- `src/pages/LandingPageEditor.tsx` — wire theme state, save/load wrapper shape, pass `theme` to renderer.
- `src/components/landing-editor/AIBuildFromUrlDialog.tsx` — accept `{ theme, sections }` from the function.
- `src/components/consumer/VenueLanding.tsx` — read theme from saved payload, pass to renderer.
- `supabase/functions/landing-from-url/index.ts` — image selection, theme assembly, Places fallback, links-aware prompt, `ctaUrl` rules, redeploy.
- **New secret**: `GOOGLE_PLACES_API_KEY` (Places API v1 enabled). I'll stop and ask you to add it before deploying.

No DB migration needed — `landing_page_html` already stores JSON. Existing rows are auto-upgraded on load.
