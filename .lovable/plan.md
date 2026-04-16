

# Landing Page Editor — Hero Image + Loyalty CTA Mode

## Overview

Two enhancements to the Landing Page Editor:

1. **Hero section**: Add an optional hero image (URL) that displays as a full-width background image behind the title/subtitle. When set, replaces the emoji logo and solid color with the image.

2. **Loyalty CTA section**: Add a `variant` toggle ("text" or "image") so the CTA can either be the current text card or an image-based banner with an optional overlay heading.

## Changes

### 1. Types (`src/components/landing-editor/types.ts`)

**HeroSection** — add `heroImageUrl?: string`. When set, renders as a full-width background image instead of emoji + solid color.

**LoyaltyCTASection** — add `variant: "text" | "image"` and `imageUrl?: string`. Default variant is `"text"` (backward compatible). When `"image"`, renders the image with heading overlaid.

### 2. Section Edit Panel (`src/components/landing-editor/SectionEditPanel.tsx`)

**Hero**: Add an "Hero Image URL" input field. When populated, the emoji field becomes optional/hidden. Add a note: "Leave empty to use emoji logo instead."

**Loyalty CTA**: Add a toggle/select for variant (Text / Image). When "image" is selected, show an "Image URL" input. The heading and description fields remain for overlay text.

### 3. Renderer (`src/components/landing-editor/LandingSectionRenderer.tsx`)

**Hero**: If `heroImageUrl` is set, render the section with `backgroundImage` CSS, a dark overlay gradient, and the title/subtitle on top. Hide the emoji logo box.

**Loyalty CTA**: If `variant === "image"` and `imageUrl` is set, render the image as background with the heading overlaid. Otherwise render the existing text card.

### 4. Default Section Factory (`types.ts` — `createDefaultSection`)

- Hero: add `heroImageUrl: ""` to default
- Loyalty CTA: add `variant: "text"` and `imageUrl: ""` to default

## Files Changed

| File | Change |
|------|--------|
| `src/components/landing-editor/types.ts` | Add `heroImageUrl` to HeroSection, `variant` + `imageUrl` to LoyaltyCTASection |
| `src/components/landing-editor/SectionEditPanel.tsx` | Add image URL field for hero, variant toggle + image URL for loyalty CTA |
| `src/components/landing-editor/LandingSectionRenderer.tsx` | Conditional rendering for hero image bg and loyalty CTA image variant |

No database changes needed — section data is stored as JSON in `landing_page_html`.

