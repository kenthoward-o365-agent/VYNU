## Goal

Make the consumer web app reliably "fit to screen" on all phones — no accidental horizontal scroll, no buttons clipped off the right edge, no content hidden behind the iPhone dynamic island / home indicator.

This is a global hardening pass, not a redesign. Existing layouts stay; we just enforce the rules that prevent overflow.

## The Rules (applied app-wide)

1. **No horizontal scroll, ever.** The page body and consumer layout get `overflow-x: hidden` and `max-width: 100vw`.
2. **Flex children that hold text must allow shrinking.** Anywhere we use `flex-1` next to truncated text or an action button, add `min-w-0` so siblings can't push past the container.
3. **Equal-split rows use `basis-0`.** Two-up / three-up card rows (like cart suggestions) use `flex-1 min-w-0 basis-0` so columns split evenly regardless of content width.
4. **Long strings truncate.** Item names, venue names, modifier labels in tight rows use `truncate` (single line) or `line-clamp-2` (cards).
5. **Safe areas respected on every full-screen consumer view.** Top bars use `padding-top: env(safe-area-inset-top)`; bottom nav and sticky CTAs use `padding-bottom: env(safe-area-inset-bottom)`.
6. **Use `100dvh` not `100vh`** for full-height consumer screens so iOS Safari's URL bar doesn't cause clipping.
7. **Images in rows are fixed-size + `shrink-0`** so they never expand the row.

## Implementation

### A. Global guards (one-time)

**`src/index.css`** — add to `@layer base`:
```css
html, body, #root { overflow-x: hidden; max-width: 100vw; }
```

**`src/components/consumer/ConsumerLayout.tsx`** — already has top/left/right safe-area padding from the previous fix. Add `overflow-x-hidden` and switch min-height to `100dvh`.

### B. Fix the immediate offender

**`src/components/consumer/CartSuggestions.tsx`**
- Wrap row in `overflow-hidden`.
- Cards: `flex-1` → `flex-1 min-w-0 basis-0`.
- Tighten: `gap-3` → `gap-2`, `p-3` → `p-2`, image `w-12 h-12` → `w-10 h-10`.
- Keep `truncate` on the name.
- Same `min-w-0` on the loading skeletons.

### C. Audit + fix the rest of the consumer surface

Sweep these files and apply rules 2–7 wherever a row contains `flex-1` + text + a trailing button/price, or uses `100vh`:

- `src/components/consumer/MenuFeed.tsx`
- `src/components/consumer/CartPanel.tsx`
- `src/components/consumer/CheckoutPanel.tsx`
- `src/components/consumer/ItemDetailScreen.tsx`
- `src/components/consumer/OrderStatus.tsx`
- `src/components/consumer/ReceiptView.tsx`
- `src/components/consumer/BottomNav.tsx` (add `padding-bottom: env(safe-area-inset-bottom)`)
- `src/components/consumer/AIChatOverlay.tsx`
- `src/components/consumer/VenueLanding.tsx`
- `src/components/consumer/SessionModeChooser.tsx`
- `src/components/consumer/DinerProfile.tsx`
- `src/components/consumer/DinerSignup.tsx`
- `src/pages/ConsumerOrder.tsx`

For each: add `min-w-0` to flex text containers, `truncate`/`line-clamp-2` to user-generated strings, `shrink-0` to leading icons/images and trailing buttons, replace `h-[calc(100vh-...)]` with `100dvh` equivalents, and add bottom safe-area padding to anything sticky at the bottom.

### D. Verification

- Open `/v/:venueId/t/:tableId` at 320×568 (smallest iPhone SE), 375×812 (iPhone 13 mini), 390×844 (iPhone 15) and 414×896.
- Walk: menu → item detail → cart (with 2 suggestions) → checkout → order status → receipt → AI chat overlay.
- Confirm: no horizontal scroll, no clipped buttons, no content under the dynamic island, bottom CTAs sit above the home indicator.

## Out of scope

Operator dashboard (admin) routes — these are desktop-first and not affected by this report.
