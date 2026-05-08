## The problem

The H&L OrderNow logo file (`public/brand/shyndig-icon.png` and `src/assets/brand/hl-ordernow-logo.png`) is a **horizontal lockup** that already contains the H&L mark **and** the "OrderNow" wordmark. Its real dimensions are **318 × 66 px** (roughly 4.8:1).

Today it's rendered into square boxes, which forces the browser to squash it:

- `src/components/DashboardLayout.tsx` line 114 — `className="h-8 w-8"` (32×32 square) inside the sidebar header, with a duplicate "H&L OrderNow" text label next to it.
- `src/pages/Auth.tsx` line 131 — `className="h-16 w-16 mx-auto"` (64×64 square) above the sign-in card.
- `src/pages/ResetPassword.tsx` line 122 — same `h-16 w-16` square.

There is no separate square icon-only asset in the repo, so the fix is to treat the logo as the wide lockup it actually is and give it room.

## Plan

### 1. Auth and ResetPassword screens

Replace the square sizing with height-only sizing so the natural aspect ratio is preserved, and bump the size so it reads well on the login screen.

- `Auth.tsx` and `ResetPassword.tsx`: change `className="h-16 w-16 mx-auto"` to `className="h-14 w-auto mx-auto"` (≈ 270 × 56 px rendered).
- Since the logo already contains the "H&L OrderNow" wordmark, also remove the redundant `<h1>H&L OrderNow</h1>` heading directly under it on both screens (keep the tagline). This avoids the wordmark appearing twice.

### 2. DashboardLayout sidebar (expanded state)

The expanded sidebar is 256 px wide (`w-64`) — plenty of room for the lockup.

- Replace `<img className="h-8 w-8" />` plus the adjacent `<span>H&L OrderNow</span>` with a single `<img className="h-8 w-auto max-w-[180px] object-contain" />`. The image already says "H&L OrderNow", so the duplicate text label goes away.

### 3. DashboardLayout sidebar (collapsed/pinned state, 64 px wide)

A 4.8:1 lockup cannot fit legibly in a 64 px rail. Two acceptable options:

- **Option A (recommended, no new asset):** in pinned mode render the same image but smaller and centered: `className="h-6 w-auto max-w-[48px] object-contain"`. The "H&L" portion remains readable; the wordmark scales down with it. No squish because we keep the aspect ratio.
- **Option B (better long-term):** ask the user to supply (or we generate) a square H&L mark PNG at `public/brand/hl-ordernow-mark.png` and use it only when `pinned`. This requires a new asset, so I'll only do it if the user wants it.

I'll implement Option A unless the user asks for Option B.

### 4. Asset cleanup (optional, not blocking)

`public/brand/shyndig-icon.png` and `public/brand/hl-ordernow-logo.png` are byte-identical (both 318×66). The codebase still references the `shyndig-icon.png` path. I'll leave the filename alone in this change to keep the diff small — renaming is a separate cleanup.

## Files touched

- `src/components/DashboardLayout.tsx` — single `<img>`, drop duplicate text label, handle pinned state.
- `src/pages/Auth.tsx` — resize logo, drop duplicate H1.
- `src/pages/ResetPassword.tsx` — resize logo, drop duplicate H1 (if present).

No CSS token, Tailwind config, or backend changes.

## Out of scope

- Creating a new square icon asset (Option B above).
- Renaming `shyndig-icon.png` → `hl-ordernow-logo.png` references.
- Favicons (those are already separate square PNGs and not affected).
