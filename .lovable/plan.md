

# Restructure Consumer Landing Flow — Auth First, Table Number on Menu

## Overview

Change the diner flow so the 3 action buttons (Continue as Guest, Sign Up, Sign In) appear directly below the hero image on the landing page — before showing the table number. Once the diner completes their choice, the table number displays as a compact banner on the menu page instead of on the landing page.

## Current Flow
Landing page: Hero → Table Number → Loyalty CTA → Floating action buttons at bottom

## New Flow
1. **Landing page**: Hero → Action buttons (Guest / Sign Up / Sign In) → Loyalty CTA (below buttons, visible by scrolling)
2. **Menu page** (after auth/guest selection): Compact table number banner at top → Menu feed

## Changes

### 1. `VenueLanding.tsx` — Move action buttons under hero, remove table number

- Remove the table-display section from the landing page entirely (it will move to the menu page)
- For the **custom sections** path: render sections but insert the 3 action buttons directly after the hero section (not as floating buttons at bottom)
- For the **default** landing page: place the 3 buttons right after the hero/logo area, before the loyalty CTA card
- Remove the `FloatingActions` component — buttons are now inline in the page flow
- The loyalty CTA section remains visible below the buttons

### 2. `LandingSectionRenderer.tsx` — Support inline actions

- Add a new `"action-buttons"` render case that displays the 3 CTA buttons inline (not floating)
- Skip rendering `table-display` sections (they'll be shown on the menu page instead)
- Or alternatively: pass an `onStart`/`onSignup`/`onSignin` callback set to the renderer and have it inject action buttons after the hero section

### 3. `ConsumerOrder.tsx` — Add table number banner to menu view

- When `started === true` and the menu is showing, render a compact table number banner at the top of the menu feed area
- Style: subtle, fits naturally — e.g. a small pill/badge showing "Table 1" with the venue's configured colors
- Pass `tableNumber` and any table-display styling (from the landing sections JSON) to the menu area

### 4. `MenuFeed.tsx` — Accept optional table number header

- Add an optional `tableNumber` prop
- When provided, render a compact table indicator at the top of the feed (small rounded badge, not the large card from the landing page)

## Files Changed

| File | Change |
|------|--------|
| `src/components/consumer/VenueLanding.tsx` | Move action buttons inline after hero; remove table-display; remove FloatingActions |
| `src/components/landing-editor/LandingSectionRenderer.tsx` | Accept action callbacks; render inline buttons after hero; skip table-display |
| `src/pages/ConsumerOrder.tsx` | Pass tableNumber to MenuFeed |
| `src/components/consumer/MenuFeed.tsx` | Add compact table number badge at top |

No database changes needed.

