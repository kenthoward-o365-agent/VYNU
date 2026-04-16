

# Fix Landing Page Editor — Images Not Persisting

## Root Cause

1. The `Venue` interface in `VenueContext.tsx` doesn't include `landing_page_html`, so the field is silently dropped from the venue object even though `select("*")` returns it from the database.
2. After saving, `handleSave` doesn't refresh the venue context — so when navigating away and back, the old venue data (without the saved sections JSON) initializes the editor with defaults.

## Changes

### 1. `src/contexts/VenueContext.tsx`
Add `landing_page_html: string | null` to the `Venue` interface.

### 2. `src/pages/LandingPageEditor.tsx`
- Remove the `(venue as any)` cast — use `venue?.landing_page_html` directly now that the type includes it.
- After a successful save, call `refetch()` from the venue context so the in-memory venue object reflects the saved data.

## Files Changed

| File | Change |
|------|--------|
| `src/contexts/VenueContext.tsx` | Add `landing_page_html` to Venue interface |
| `src/pages/LandingPageEditor.tsx` | Remove `as any` cast; call `refetch()` after save |

