# AI: Build Landing Page from Website URL

Yes — we can do this. Here's the plan.

## What it does

In the Landing Page Editor toolbar, add a **"Build from website"** button. The user pastes a URL (e.g. their existing restaurant site). We scrape the site for branding (colors, fonts, logo) and core content (name, hours, address, social links, signature dishes), then ask Lovable AI to assemble a complete landing page as our sections JSON. The editor replaces (or merges with) the current sections so the user can keep tweaking visually.

## User flow

1. Click **"Build from website ✨"** in the top toolbar.
2. Dialog opens: paste URL → choose **Replace all sections** or **Append new sections** → click Generate.
3. Progress states: *Scraping site… → Analysing branding… → Composing sections…* (~15–30s).
4. Sections appear in the editor; toast confirms success. User can Save & Publish as normal.

## Technical approach

**1. Scrape — Firecrawl (new connector required)**
- Single `POST /v2/scrape` call with `formats: ['markdown', 'summary', { type: 'json', schema: {...} }, 'branding']`.
- Branding gives us `colors.primary/secondary/background`, `fonts[]`, `images.logo`.
- The `json` extraction pulls structured fields: `venue_name`, `tagline`, `about`, `signature_dishes[]`, `hours`, `address`, `instagram`, `facebook`.

**2. Generate sections — Lovable AI Gateway**
- Model: `google/gemini-3-flash-preview` (default, fast, cheap).
- Use AI SDK `generateText` with `Output.object` and a Zod schema that matches our `LandingSection[]` discriminated union.
- System prompt instructs the model to produce a sensible default ordering (hero → table-display → featured-items → loyalty-cta → hours-location → social-links), apply the scraped `bgColor`/colours to the hero + table-display, copy the venue's tone of voice, and only emit fields that exist in our `types.ts` shapes.

**3. Wiring**
- **New edge function** `supabase/functions/landing-from-url/index.ts`:
  - Auth: validates JWT and that caller `is_venue_manager(venue_id)`.
  - Calls Firecrawl, then Lovable AI, returns `{ sections: LandingSection[], branding: {...} }`.
  - Logs token usage to `ai_usage_log` (feature: `landing_from_url`).
- **New client component** `src/components/landing-editor/AIBuildFromUrlDialog.tsx`: URL input + replace/append toggle + progress UI.
- **Edit** `src/pages/LandingPageEditor.tsx`: add the toolbar button and dialog, merge/replace returned sections into state.
- Hero image: if Firecrawl returns `images.logo` or an OG image, store it in the hero section's `heroImageUrl`.

**4. Connector & secrets**
- Requires the **Firecrawl** connector (not currently linked). When you approve the plan, I'll prompt you to link it; it provides `FIRECRAWL_API_KEY` to edge functions automatically.
- `LOVABLE_API_KEY` is already provisioned for Lovable AI — no new secret needed.

## Out of scope (can do later)
- Generating custom hero imagery via image-gen models.
- Auto-importing the scraped menu into the Menu Builder (separate flow already exists).
- Crawling multiple pages (we only scrape the URL the user provides; good enough for most homepages).

## Cost
- Firecrawl: ~1–5 credits per generation (one scrape with branding + json + summary).
- Lovable AI: a single Gemini Flash call, well under 1¢ per generation.
