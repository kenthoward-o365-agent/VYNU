

# Landing Page Editor — Image Upload for Hero & Loyalty CTA

## Overview

Replace the URL-only input for hero images (and loyalty CTA images) with a file upload button that uploads to the existing `venue-assets` storage bucket and sets the public URL automatically. Users can still paste a URL manually as a fallback.

## Changes

### 1. `SectionEditPanel.tsx` — Add upload UI

- Import `supabase`, `useVenue`, `resizeFileToWebP`, and `useState` for upload state
- Accept `venueId` as a new prop (passed from `LandingPageEditor.tsx`)
- **Hero section**: Replace the plain URL input with an upload area — a file input button + optional manual URL input. On file select: resize to WebP via `resizeFileToWebP`, upload to `venue-assets/landing/{venueId}/{timestamp}.webp`, get public URL, call `update({ heroImageUrl: publicUrl })`. Show a small preview thumbnail when set, with a "Remove" button
- **Loyalty CTA (image variant)**: Same upload pattern for `imageUrl`
- Show a loading spinner during upload

### 2. `LandingPageEditor.tsx` — Pass venue ID

- Pass `venueId={venue?.id}` to `SectionEditPanel`

### 3. No database or storage changes needed

The `venue-assets` bucket already exists and is public. The upload path pattern (`landing/{venueId}/...`) keeps files organized. The same `resizeFileToWebP` utility already used by Menu Builder handles image optimization.

## Files Changed

| File | Change |
|------|--------|
| `src/components/landing-editor/SectionEditPanel.tsx` | Add file upload with preview for hero image and loyalty CTA image fields |
| `src/pages/LandingPageEditor.tsx` | Pass `venueId` prop to `SectionEditPanel` |

