

# Mobile Web App Preview from QR Code Click

## Overview

Add a "Preview" button to each table card (and the QR zoom dialog) that opens a dialog containing the consumer-facing mobile web app rendered inside the existing `MobilePreviewFrame` component. This lets operators demo the diner experience without scanning a physical QR code.

## Approach

Use an **iframe** inside `MobilePreviewFrame` pointing to `/order/{venueId}/{tableId}`. This is the simplest approach — the consumer app already works as a standalone route, so embedding it in an iframe gives a fully functional, live preview.

## Changes

### `src/pages/Tables.tsx`

1. Add a new state `previewTable` (similar to `qrDialogTable`) to track which table is being previewed
2. Add a "Preview" button to each table card (e.g. with a `Smartphone` icon)
3. Add a "Preview" button in the QR zoom dialog
4. Add a new `Dialog` that renders `MobilePreviewFrame` with an iframe inside:
   ```
   <MobilePreviewFrame>
     <iframe
       src="/order/{venue.id}/{table.id}"
       className="w-full h-full border-0"
       title="Mobile Preview"
     />
   </MobilePreviewFrame>
   ```
5. Make the dialog wider (`max-w-lg`) to accommodate the phone frame

### No other files need changes

The `MobilePreviewFrame` component already exists and handles phone/tablet device switching. The `ConsumerOrder` page already works as a standalone route.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Tables.tsx` | Add preview state, preview button on cards + QR dialog, preview dialog with iframe in MobilePreviewFrame |

