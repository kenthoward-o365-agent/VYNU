

# Landing Page Editor — Modern UX Overhaul

## Problem
GrapesJS exposes raw CSS properties, layer trees, and a code-editor mindset. Venue operators are not web designers — they need something closer to Canva or Squarespace.

## Approach: Replace GrapesJS with a Template-Based Section Editor

Instead of a generic drag-and-drop HTML editor, build a **section-based page builder** using native React components. Operators pick from pre-designed section templates, customize content via simple forms (text inputs, color pickers, image uploads), and reorder sections by dragging. No CSS knowledge needed.

```text
┌──────────────────────────────────────────────────┐
│  ← Back    Landing Page Editor    [Preview] [Save]│
├────────────┬─────────────────────┬───────────────┤
│  SECTIONS  │                     │  EDIT PANEL   │
│            │   Live Preview      │               │
│ [+ Add]    │   (mobile frame)    │  Title: ___   │
│            │                     │  Subtitle: __ │
│ ☰ Hero     │   ┌───────────┐    │  BG Color: 🎨 │
│ ☰ Specials │   │  Phone    │    │  Image: 📁    │
│ ☰ Loyalty  │   │  Preview  │    │               │
│ ☰ Hours    │   │           │    │  [Delete]     │
│ ☰ Footer   │   └───────────┘    │               │
└────────────┴─────────────────────┴───────────────┘
```

## What Changes

### 1. Remove GrapesJS dependency
- Uninstall `grapesjs` from package.json
- Delete GrapesJS CSS overrides from `index.css`

### 2. New data model: Section-based JSON
Store landing page as a JSON array of typed sections in `landing_page_html` (reuse existing column, store JSON string):
```json
[
  { "type": "hero", "title": "Welcome", "subtitle": "Scan & order", "bgColor": "#1a1a2e", "logoEmoji": "🍽️" },
  { "type": "table-display" },
  { "type": "featured-items", "title": "Today's Specials", "items": [...] },
  { "type": "loyalty-cta", "heading": "Earn Rewards", "description": "..." },
  { "type": "hours", "address": "123 Main St", "hours": "Mon-Fri 11-10" },
  { "type": "footer", "socials": { "instagram": "...", "facebook": "..." } }
]
```

### 3. New components

**`LandingPageEditor.tsx`** — Complete rewrite:
- Left: sortable section list (drag to reorder via `@dnd-kit/sortable`) with "+ Add Section" button
- Center: live mobile-framed preview rendering the sections
- Right: context-sensitive edit panel — when a section is selected, show simple form fields (text inputs, color picker, emoji picker, image upload)

**`LandingSectionRenderer.tsx`** — Pure render component:
- Takes section JSON, outputs styled HTML/React for each type
- Used in both the editor preview AND the consumer `VenueLanding.tsx`
- Section types: `hero`, `table-display`, `loyalty-cta`, `featured-items`, `hours-location`, `social-links`, `text`, `image`, `divider`, `spacer`

**`SectionEditPanel.tsx`** — Form panels per section type:
- Hero: title, subtitle, background color/gradient picker, logo upload
- Featured items: add/remove items with name, emoji, price
- Loyalty CTA: heading, description text
- Hours: address, hours text
- All use standard shadcn inputs, no CSS knowledge required

### 4. Section templates with thumbnails
The "+ Add Section" opens a modal/sheet showing visual thumbnails of each available section type. One click adds it with sensible defaults.

### 5. Drag-to-reorder
Use `@dnd-kit/sortable` for the section list. Each section shows a drag handle, section type label, and a small preview thumbnail.

### 6. Mobile preview frame
Center panel wraps the preview in a phone-shaped frame (375px wide, rounded corners, notch) so operators see exactly what diners see.

### 7. Update consumer rendering
`VenueLanding.tsx` detects whether `landing_page_html` contains JSON (starts with `[`) or legacy HTML, and renders accordingly using `LandingSectionRenderer`.

## Technical Details

**New dependency**: `@dnd-kit/core` + `@dnd-kit/sortable` for drag reorder

**Files to create**:
- `src/pages/LandingPageEditor.tsx` (rewrite)
- `src/components/landing-editor/SectionList.tsx`
- `src/components/landing-editor/SectionEditPanel.tsx`
- `src/components/landing-editor/SectionAddModal.tsx`
- `src/components/landing-editor/LandingSectionRenderer.tsx`
- `src/components/landing-editor/MobilePreviewFrame.tsx`

**Files to edit**:
- `src/components/consumer/VenueLanding.tsx` — use `LandingSectionRenderer` for JSON pages
- `src/index.css` — remove GrapesJS overrides
- `package.json` — remove grapesjs, add @dnd-kit

