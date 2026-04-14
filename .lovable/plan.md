

# Update Logo Icon to New Radial Design

## What's changing
Replace the old filled-circle icon (`noshi-icon.svg`) with the new D2 radial logo mark across the app. The uploaded SVG is the "on light" variant — we also need a "on dark" variant for dark theme contexts.

## Logo variant strategy

The uploaded logo uses **Ai Indigo dots on transparent/light background**. For dark mode, we need to invert the indigo dots to white/ivory (`#F8F5ED`) so they're visible against dark backgrounds.

- **`public/ordrup-icon.svg`** — "on light" version (indigo + gold on transparent) — used as favicon and default
- **`public/ordrup-icon-dark.svg`** — "on dark" version (ivory + gold on transparent) — used on dark backgrounds
- **Delete** `public/noshi-icon.svg` (old icon)

## Files to edit

| File | Change |
|------|--------|
| `public/ordrup-icon.svg` | Copy uploaded SVG (scaled to 64×64 viewBox for favicon use) |
| `public/ordrup-icon-dark.svg` | Same SVG but indigo circles → `#F8F5ED`, gold stays |
| `index.html` | Favicon href → `/ordrup-icon.svg` |
| `src/pages/Auth.tsx` | Import new icon, use dark variant when `theme === 'dark'` |
| `src/pages/ResetPassword.tsx` | Same icon swap with theme awareness |
| `public/noshi-icon.svg` | Delete |

## Technical details
- The uploaded SVG is 512×512 with no background fill — perfect for both themes on transparent
- Auth.tsx already has `useTheme()` — we'll conditionally pick the light/dark icon variant
- The 512px SVG works fine as favicon (browsers downscale); no need to resize

