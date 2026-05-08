## Remove White Label Feature

The previous white label implementation will be fully torn out. Future white labels will instead be handled by branching the codebase and spinning up a fresh environment per tenant.

### Files to delete
- `src/pages/AdminWhiteLabel.tsx`
- `src/components/admin/BrandPinCard.tsx`
- `src/contexts/BrandContext.tsx`
- `src/lib/white-label.ts`

### Files to edit
- `src/App.tsx` — remove `BrandProvider` wrapper and the `/admin/white-label` route.
- `src/components/DashboardLayout.tsx` — revert brand-aware logo/product name back to hardcoded Shyndig assets.
- `src/pages/AdminVenueDetail.tsx` — remove the `BrandPinCard` import and render.
- `src/pages/Tables.tsx` — replace `getQrBaseUrlForVenue` calls with the original `https://shyndig.lovable.app` constant.
- Any admin nav link pointing to `/admin/white-label` (if present in sidebar).

### Database migration
A new migration will:
- Drop the `white_label_brand_id` column from `venues`.
- Drop the `white_label_brands` table (and any related policies/indexes).

The Supabase types file regenerates automatically after the migration.

### QR codes
Existing printed QR stickers are unaffected — they already point to `shyndig.lovable.app`, which remains the single host.

### Verification
- Confirm the app loads, admin venue detail renders without the brand card, and `/admin/white-label` 404s.
- Confirm Tables page still generates QR URLs using `shyndig.lovable.app`.