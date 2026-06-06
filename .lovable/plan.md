
# H&L OrderNOW marketing site — Claude design brief

This plan delivers a single, paste-ready prompt for Claude design. No app code changes are required — this is a separate marketing site. Below are (1) the strategic decisions baked into the prompt, (2) things the original brief missed that I've added, and (3) the full prompt.

## Strategic decisions

- **Audience**: Hospitality groups / enterprise operators (AU-first, NZ-ready).
- **Primary CTA**: *Book a demo*. Secondary: *Talk to sales* / *See it live*.
- **Tone**: Premium, AI-forward, confident — Linear/Vercel polish, not Stripe-bright.
- **Nav (tabbed)**: Platform · AI (Spark) · H&L Pay · Diner CRM & Loyalty · POS & Standalone · Compare · Industries (Pubs / Clubs / QSR / Fine Dining) · Pricing · Book a demo.
- **Brand lock**: H&L Blue `#3BAEDC`, H&L Blue Dark `#2A8FB8`, H&L Green `#7FC242`, Ink `#1F3B4D`, Surface white, Muted `#F4F8FB`. Logo at `/brand/hl-ordernow-logo.png` (mark at `/brand/shyndig-icon.png`).

## What the original brief missed (added to the prompt)

1. **Security & compliance band** — PCI DSS SAQ-A, AU Privacy Act / APP, SOC 2 in progress, data residency in AU.
2. **Time-to-value proof** — "Live in a weekend", QR sticker shipping, no app download for diners.
3. **Group features** — Multi-venue dashboard, group loyalty, cross-venue reporting, role-based access.
4. **Accessibility & inclusivity** — WCAG 2.2 AA, allergens/dietary, large-text mode, multi-language.
5. **Reliability story** — Offline-tolerant QR, throttling/surge controls, kitchen pacing — operators care about Friday-night load.
6. **AI revenue attribution** — Every AI-driven order tracked → "AI Revenue Generated $" tile (your existing Spark metric) shown as a hero proof bar.
7. **Open ecosystem** — Works standalone *or* with H&L POS, plus integrations roadmap (accounting, rostering, BI).
8. **Australian voice & social proof** — Local venue logos, AU $ pricing, AU support hours.
9. **SEO scaffolding** — Industry landing pages (Pubs/Clubs/QSR/Fine Dining) + Compare pages individually indexable.
10. **Trust artefacts** — Customer story carousel, uptime stat, "no lock-in" promise, ISO-style badge strip.
11. **Sticky "book a demo" rail** + exit-intent capture.
12. **Dark/light hero pairing** — dark hero band for premium feel, white feature surfaces for clarity.

## Competitor comparison grid (rows × columns)

Columns: **H&L OrderNOW · me&u · Mr Yum (Lightspeed) · Chewzie · Square/Toast Order & Pay**

Rows: Agentic AI ordering · AI instant campaigns · Diner CRM with birthdays & RFM · Built-in PayFac (Apple/Google Pay) · Works standalone (no POS required) · Native H&L POS integration · Multi-venue group loyalty · Order throttling & kitchen pacing · QR stickers (permanent URLs) · AI revenue attribution · AU support & data residency · Pay-per-order pricing · PCI SAQ-A · White-label landing pages · Co-pilot for managers.

---

## The Claude design prompt (paste this verbatim)

```text
You are designing a premium marketing website for H&L OrderNOW — an agentic, AI-powered ordering, payments, and diner-CRM platform built for the H&L POS ecosystem (Australia-first, hospitality groups and enterprise venues). The site must feel like Linear / Vercel / Arc — confident, dark hero, restrained motion, generous whitespace, crisp type — not a busy SaaS template.

BRAND (lock these — do not invent new colors or fonts)
- Primary: H&L Blue #3BAEDC (hover #2A8FB8)
- Accent: H&L Green #7FC242 (success / "included" ticks)
- Ink: #1F3B4D (headings, dark sections, footer)
- Surface: #FFFFFF
- Muted surface: #F4F8FB
- Type: Inter or DM Sans for UI; a refined display face (e.g. "General Sans" or "Söhne") for hero headlines. Tight tracking on H1s.
- Logo: /brand/hl-ordernow-logo.png (full lockup), /brand/shyndig-icon.png (mark only — legacy filename, treat as the H&L OrderNOW mark).
- Radius 12–16px, soft shadow on cards, subtle 1px borders in #E6EEF4.
- Motion: 200–400ms easings, hero gradient slow-shift, scroll-reveal fades only. No bouncy springs.

AUDIENCE & CTA
- Primary audience: hospitality groups and enterprise operators in Australia.
- Primary CTA everywhere: "Book a demo" (H&L Blue button).
- Secondary CTAs: "Talk to sales", "See it live", "Get the brochure (PDF)".
- Sticky bottom-right "Book a demo" pill on scroll. Exit-intent modal with email capture.

NAVIGATION (tabbed, top of page, sticky on scroll)
Platform · AI (Spark) · H&L Pay · Diner CRM & Loyalty · POS & Standalone · Compare · Industries ▾ (Pubs, Clubs, QSR, Fine Dining) · Pricing · [Book a demo]
Each top-level item is its own full page (see PAGE BRIEFS below). Footer carries About, Security & Compliance, Careers, Contact, Status, Knowledge Base, Login.

HOMEPAGE
1. Dark Ink hero (#1F3B4D → near-black gradient), one-line headline + 18-word sub.
   - Headline candidates (pick the strongest, propose 3 more):
     a) "The agentic ordering platform that pays for itself by Friday."
     b) "Ordering, payments and diner CRM — powered by one AI."
     c) "Replace the menu. Replace the wait. Replace the guesswork."
   - Sub: "H&L OrderNOW turns every QR scan into a conversation, every order into revenue, and every diner into a regular."
   - Hero visual: a stylised iPhone tilted 8°, showing the Spark AI chat ordering a steak — with floating cards around it (an "AI-generated $1,284 today" tile, a birthday-campaign card, an Apple Pay tap). Use H&L Blue glow.
2. Logo bar of AU venue groups (placeholder, 6 monochrome logos).
3. "One platform, four products" — 4-up grid: AI Ordering · H&L Pay · Diner CRM · Loyalty. Each card opens its page.
4. AI revenue proof band — large counter "AI-attributed revenue across the network: $X,XXX,XXX this month" on Ink background.
5. "Works alone. Better together." — split panel showing Standalone vs With H&L POS, with a toggle.
6. Comparison teaser → links to /compare.
7. Industry tiles → Pubs / Clubs / QSR / Fine Dining.
8. Security & compliance strip: PCI DSS SAQ-A · AU Privacy Act / APP · SOC 2 (in progress) · Data hosted in AU · WCAG 2.2 AA.
9. Testimonial carousel (2–3 quotes).
10. Final CTA band — "Live in a weekend. Book a 20-minute demo."

PAGE BRIEFS (each gets a dedicated, deep page — not a section)

Platform — the agentic ordering flow end-to-end: scan → AI chat OR TikTok-style feed → upsell → pay → kitchen pacing → loyalty. Animated diagram. Reliability callouts: order throttling, surge controls, offline-tolerant QR, permanent QR sticker URLs.

AI (Spark) — three pillars:
  • Agentic ordering (intent-based chat that replaces the menu)
  • Instant AI campaigns (daily specials, contests, birthday blasts — email/SMS/push/in-app, with guardrails)
  • AI co-pilot for managers + AI revenue attribution (every AI-influenced order tracked into one Spark Analytics tile).
Include a "How the AI makes you money" calculator (sliders: covers/day, avg ticket → projected uplift).

H&L Pay — built-in PayFac. Apple Pay, Google Pay, stored cards, 3DS2, manual or auto-capture, AU surcharging compliance, single statement, chargeback handling. Diagram of money flow. "No third-party processor handoff" headline.

Diner CRM & Loyalty — birthdays captured at signup, RFM segments, AI lookalike segments, multi-channel campaigns (Email/SMS/Push/In-app), suppression & STOP handling, group loyalty across venues, points & rewards, attribution back to AI Revenue.

POS & Standalone — toggleable page: "Run H&L OrderNOW on its own" vs "Plug into H&L POS". Feature parity matrix. Migration story for venues moving off me&u / Mr Yum / Chewzie.

Compare — the hero competitive grid. Sticky left column (features), competitors as columns. Use H&L Green tick, light grey dash, and "Limited" pill. Footnote each row with a source link. Columns: H&L OrderNOW · me&u · Mr Yum · Chewzie · Square/Toast Order & Pay. Rows listed below (FEATURE GRID). Above the grid: "Built for AU hospitality groups. Benchmarked against the category." Below: CTA "See the side-by-side demo".

Industries (Pubs / Clubs / QSR / Fine Dining) — one page each, same template: hero photo, three pain points, three H&L OrderNOW answers, one mini case study, an industry-specific feature callout (e.g. Clubs → member loyalty + RSA prompts; Fine Dining → coursing & pacing; Pubs → big-round splitting; QSR → throughput & kiosk).

Pricing — pay-per-order, transparent. Three plans: Standalone · Group · Enterprise. AUD. Show "you only pay when we make you money." FAQ accordion.

Security & Compliance (footer page) — PCI SAQ-A statement, data residency, RLS-based tenancy, SSO/SAML for enterprise, role-based access, audit log, incident response, sub-processor list.

About / Contact / Book a demo — standard, with AU support hours and a Calendly-style embed.

FEATURE GRID (use exactly these rows, in this order)
1. Agentic AI ordering (chat replaces the menu)
2. AI instant campaigns (email/SMS/push/in-app, with guardrails)
3. Diner CRM with birthdays, RFM & AI lookalike segments
4. Built-in PayFac — Apple Pay, Google Pay, stored cards
5. Works fully standalone (no POS required)
6. Native H&L POS integration
7. Multi-venue group loyalty
8. Order throttling & kitchen pacing
9. Permanent QR sticker URLs (never re-print)
10. AI revenue attribution tile
11. Australian support, data residency & AUD pricing
12. Pay-per-order pricing (no SaaS lock-in)
13. PCI DSS SAQ-A scope
14. White-label landing pages per venue
15. AI co-pilot for managers
Mark each competitor honestly: tick / dash / "Limited" pill. Footnote with the source URL.

ACCESSIBILITY & PERFORMANCE
- WCAG 2.2 AA, prefers-reduced-motion respected, full keyboard nav, alt text on all imagery.
- Core Web Vitals: target LCP < 2.0s. Image-light hero (SVG illustrations + one hero render). No video autoplay with sound.
- SEO: each page has a unique 55-char title and 150-char meta description. Schema.org Organization + Product + FAQ JSON-LD.

DELIVERABLES FROM YOU (Claude design)
- Full responsive site (desktop / tablet / mobile) for every page above.
- Three headline options per page so we can A/B.
- A reusable component library (button, pill, tick row, comparison cell, stat tile, testimonial card, feature card, industry tile, CTA band, footer).
- Dark hero / light body system, consistent across pages.
- Export-ready Tailwind tokens that match the brand lock above.

DO NOT
- Do not introduce purple, pink, orange, or neon. H&L Blue + Green only.
- Do not use generic "AI sparkle" Lucide icons as the brand mark.
- Do not mention "Shyndig", "Sippa", "Tab-Less", "ShyndigPay", "OrdrPay", or "Adyen" anywhere on the public site. The payments product is H&L Pay.
- Do not invent customer names — use "Group A / Group B" placeholders for testimonials until real ones are supplied.
```

---

Once you approve, I'll save this prompt into the project as `docs/marketing/hl-ordernow-claude-design-brief.md` so it's versioned alongside the codebase, and add a memory note pointing future sessions at it.
