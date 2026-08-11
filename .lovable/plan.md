# Sales collateral: H&L OrderNOW marketing site pages

## Goal
Replace the placeholder homepage and add focused sales pages that showcase H&L OrderNOW against competitors and surface the recently shipped features. All pages follow the H&L brand lock and the marketing-site design brief.

## Scope

### 1. Marketing homepage (`src/pages/Index.tsx`)
Replace the placeholder with a full homepage using the dark-hero / light-body system from the design brief.

Sections:
- Sticky nav with: Platform, AI, H&L Pay, Diner CRM & Loyalty, POS & Standalone, Compare, Pricing, Book a demo
- Dark Ink hero with headline, 18-word sub, and CTA
- Logo bar of AU hospitality groups
- "One platform, four products" 4-up grid
- AI revenue proof band
- "Works alone. Better together" split panel
- Comparison teaser → /compare
- Industry tiles → /features
- Security & compliance strip
- Testimonial carousel
- Final CTA band
- Footer with links

### 2. Competitor comparison page (`src/pages/Compare.tsx`)
Route: `/compare`
- Hero: "Built for AU hospitality groups. Benchmarked against the category."
- Sticky comparison grid: H&L OrderNOW vs me&u, Mr Yum, Chewzie, Square/Toast Order & Pay
- Rows: agentic AI ordering, AI instant campaigns, Diner CRM, built-in PayFac, standalone capable, native H&L POS, multi-venue group loyalty, throttling & kitchen pacing, permanent QR stickers, AI revenue attribution, AU support & data residency, pay-per-order, PCI SAQ-A, white-label pages, AI co-pilot
- Visual markers: H&L Green tick, grey dash, "Limited" pill
- CTA band: "See the side-by-side demo"
- SEO title + meta description

### 3. Features overview page (`src/pages/Features.tsx`)
Route: `/features`
- Hero focused on "What's new in OrderNOW"
- Feature cards for recently shipped capabilities:
  - Zones & Multi-Menu
  - Open Tabs & flexible payment timing
  - Pub+ Loyalty / Eagle Eye integration
  - Smart surcharges & special dates
  - POS integrations (H&L Exceed, Doshii, Lightspeed, Square, Mock)
  - AI ordering (Spark)
- Each card: short description, 3 bullets, link to relevant product page or demo
- CTA band: "Book a demo"
- SEO title + meta description

### 4. Shared marketing components
Create `src/components/marketing/`:
- `MarketingLayout.tsx` — nav + footer wrapper
- `MarketingNav.tsx` — sticky nav with links and "Book a demo" CTA
- `MarketingFooter.tsx` — footer links
- `HeroSection.tsx` — dark hero reusable wrapper
- `FeatureCard.tsx` — icon + title + bullets
- `ComparisonGrid.tsx` — sticky comparison table
- `CtaBand.tsx` — final CTA section
- `DemoPill.tsx` — floating bottom-right "Book a demo" pill

### 5. Routing & SEO
- Update `src/App.tsx` to add public marketing routes (`/`, `/compare`, `/features`) rendered without the dashboard layout
- Add `index.html` title and meta description for the homepage
- Add per-page `<title>` and `<meta name="description">` via React Helmet or direct page components

## Brand & design
- Colors: H&L Blue `#3BAEDC`, Blue Dark `#2A8FB8`, H&L Green `#7FC242`, Ink `#1F3B4D`, Surface white, Muted `#F4F8FB`
- Use existing Tailwind tokens (`primary`, `accent`, `foreground`, `muted`, `card`, etc.) — no hardcoded hex classes
- Typography: Inter / DM Sans; tight tracking on H1s
- Primary CTA: "Book a demo" (H&L Blue button)
- Radius, soft shadows, subtle borders per design brief

## Out of scope
- No backend/API changes
- No auth changes for public pages
- No Calendly or external booking integration wiring (CTAs can be mailto or placeholder links)
- No generated PDF downloads in this pass

## Deliverables
- `src/pages/Index.tsx` (homepage)
- `src/pages/Compare.tsx` (competitor comparison)
- `src/pages/Features.tsx` (recent features)
- `src/components/marketing/*` (shared components)
- Updated `src/App.tsx` routes
- Updated `index.html` metadata
