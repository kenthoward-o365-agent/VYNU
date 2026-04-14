

# Update Sidebar Logo to New Radial Icon

## Problem
The sidebar header in `DashboardLayout.tsx` still imports the old `noshi-lockup.svg` / `noshi-lockup-dark.svg` wordmark logos. The new D2 radial icons (`public/ordrup-icon.svg` and `public/ordrup-icon-dark.svg`) were only wired into Auth and ResetPassword pages.

## Changes

### `src/components/DashboardLayout.tsx`
- Replace the `noshi-lockup` imports with the new radial icon paths from `/public`
- Light theme → `/ordrup-icon.svg`, Dark theme → `/ordrup-icon-dark.svg`
- Add the "Ordrup" text next to the icon (since the old file was a lockup with text built in, the new icon is just the mark)
- Adjust sizing: icon `h-8 w-8`, with "Ordrup" text label beside it

### Cleanup
- Delete `src/assets/noshi-lockup.svg` and `src/assets/noshi-lockup-dark.svg` (no longer referenced anywhere)

