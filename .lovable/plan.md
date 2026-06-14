## Denser Venue & Admin Sidebar Tiles

### Problem
The venue sidebar has 12+ stacked tiles (Dashboard, Spark AI, Menu, Pricing, Tables, Orders, Order Cfg, Analytics, Diners, DayEnd, Billing, Settings). At typical operator monitor / tablet heights the list overflows and requires scrolling.

### Goal
Fit all items without scrolling by reducing tile height, icon size and spacing across both venue and admin nav.

### Changes in `src/components/DashboardLayout.tsx`

1. **NavTile size reduction**
   - Expanded (`collapsed=false`): height 72px → 56px, label `text-[10px]` stays, icon wrapper `h-8 w-8` → `h-7 w-7`.
   - Collapsed (`collapsed=true`): height 12 → 10 (compact square), icon area also trimmed.
   - Remove the redundant inline background on the wrapper `<span>`; let active state use only the tile-level background and the `shadow-[inset_...]` left edge.
   - Keep tooltips and click behaviour unchanged.

2. **Nav rail padding / gap**
   - `<nav>` gap: `space-y-1.5` → `space-y-0.5`.
   - Vertical rail padding `py-2` stays the same; horizontal padding unchanged.

3. **Admin nav tiles**  
   - Admin items use the same `NavTile` component, so they automatically inherit the smaller footprint.
   - No separate admin-specific work needed.

### What stays the same
- Active / hover styling logic, icons, routing, tooltips, pin/unpin toggle, mobile drawer, group divider labels.
- No grouping or "More" menu — every item remains directly accessible.

### Visual impact
- Before: ~12 tiles × 72px + 1.5 gaps ≈ 930px of vertical space.  
- After: ~12 tiles × 56px + 0.5 gaps ≈ 690px of vertical space.  
- Fits comfortably inside a 900px-high viewport (common for laptops / iPads in landscape).