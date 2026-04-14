

# Add Dark Theme Nav Icons to Sidebar

## Overview
Wire in the 9 uploaded dark-theme SVGs alongside the existing light-theme ones, replacing the CSS `invert` filter fallback with proper theme-aware icon switching.

## Changes

### 1. Copy dark SVGs to `src/assets/nav-icons/`
Copy all 9 uploaded dark variants (e.g., `dashboard-dark.svg`, `orders-dark.svg`, `Ordrup_AI_Analytics-dark.svg`) into `src/assets/nav-icons/`.

### 2. Update `src/components/DashboardLayout.tsx`
- Import each dark SVG variant
- Change `venueNavItems` to store both light and dark icon paths (e.g., `{ light: navDashboard, dark: navDashboardDark }`)
- Update rendering: pick `item.icon.dark` or `item.icon.light` based on current theme from `useTheme()`
- Remove the `dark:invert dark:brightness-200` CSS filter hack

### Files affected
| File | Change |
|------|--------|
| `src/assets/nav-icons/*-dark.svg` (9 files) | Create — dark theme icon assets |
| `src/components/DashboardLayout.tsx` | Import dark icons, theme-aware selection, remove invert filter |

