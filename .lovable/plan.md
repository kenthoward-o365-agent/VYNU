

# Add Custom Light-Theme Nav Icons to Sidebar

## Overview
Wire in the 9 uploaded light-theme SVGs now. Dark-theme variants will be added later when uploaded. Until then, dark mode will use a CSS `brightness` filter on the light icons as a fallback.

## Icon mapping

| Nav item | File | Replaces |
|----------|------|----------|
| Dashboard | `dashboard.svg` | `LayoutDashboard` |
| Ordrup AI Analytics | `Ordrup_AI_Analytics.svg` | `BarChart3` |
| Menu Builder | `menu-builder.svg` | `UtensilsCrossed` |
| Pricing | `pricing.svg` | `Tag` |
| Tables & QR | `tables-qr.svg` | `QrCode` |
| Orders | `orders.svg` | `ClipboardList` |
| Analytics | `analytics.svg` | `TrendingUp` |
| Diners | `diners.svg` | `Users` |
| Settings | `settings.svg` | `Settings` |

## Changes

### 1. Copy SVGs → `src/assets/nav-icons/`
Copy all 9 uploaded SVGs into `src/assets/nav-icons/` for Vite module imports.

### 2. Update `src/components/DashboardLayout.tsx`
- Import each SVG as a string path
- Change `venueNavItems` icon field to the imported SVG path (string) instead of Lucide component
- Update the nav rendering to detect string vs component:
  - String → `<img src={icon} className="h-4 w-4" />` with a `dark:invert dark:brightness-200` filter as temporary dark-mode fallback
  - Component → `<Icon className="h-4 w-4" />` (admin/group items stay as Lucide)
- Sub-menu items (Import, Enhance Images, Modifiers, etc.) keep their Lucide icons — only top-level venue nav items change

### 3. Dark mode strategy
Apply `dark:invert` CSS filter as a temporary fallback until the dark-theme icon set is uploaded, at which point we'll swap to explicit light/dark paths.

## Technical detail
The `NavItem` interface `icon` field is already typed `any`, so it supports both Lucide components and string paths without a type change.

