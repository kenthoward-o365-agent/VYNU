

# Fix Image Display Issues End-to-End

## Problem Analysis

Looking at the screenshot, some menu item thumbnails display correctly while others appear broken or zoomed. The root causes:

1. **The `optimizedImageUrl` helper uses Supabase's `/render/image/` endpoint** — this transformation endpoint may not work for all file types or may fail silently for certain images, returning nothing or a broken response. When the render endpoint fails, the browser shows a broken/zoomed image.

2. **Original uploads keep their native format** (PNG, JPG, HEIC, etc.) while AI-enhanced images are saved as WebP. The render endpoint may not handle all source formats equally well.

3. **Generated images are uploaded as raw bytes with `contentType: "image/webp"`** but the actual content from Gemini is PNG (base64 data URI starts with `data:image/png`). This content-type mismatch means the file is stored as PNG bytes but labeled as WebP — which can cause the render/transform endpoint to fail or produce garbled output.

4. **No fallback** — if the render URL fails to load, nothing catches it and falls back to the original public URL.

## Fixes

### 1. Fix content-type mismatch in `batch-generate-images/index.ts`
The edge function strips the base64 prefix but hardcodes `contentType: "image/webp"`. The AI actually returns PNG. Detect the actual MIME type from the data URI prefix and use that for upload.

### 2. Fix content-type in `enhance-menu-image` flow (`ImageEnhancerDialog.tsx`)
The enhance flow uses `resizeToWebP()` which correctly converts to WebP — this is fine. But verify the canvas `toBlob` actually produces valid WebP (some browsers may fall back to PNG).

### 3. Add `<img>` error fallback in `MenuFeed.tsx`
Add an `onError` handler that falls back to the original (non-transformed) public URL when the `/render/image/` endpoint fails. This makes existing broken images work immediately.

### 4. Normalize initial uploads in `MenuBuilder.tsx`
Convert user-uploaded images to WebP before storing (using `resizeToWebP`), so all images in storage have a consistent format that the render endpoint handles reliably.

## Files Changed

| File | Change |
|------|--------|
| `src/components/consumer/MenuFeed.tsx` | Add `onError` fallback on `<img>` to use raw public URL when render endpoint fails |
| `supabase/functions/batch-generate-images/index.ts` | Detect actual MIME type from base64 prefix; use correct content-type and file extension |
| `src/pages/MenuBuilder.tsx` | Convert uploaded images to WebP via `resizeToWebP` before storage upload |
| `src/lib/image-utils.ts` | Add a `resizeFileToWebP` helper that accepts a `File` object (not just base64) |

## Technical Detail

**The critical bug**: In `batch-generate-images/index.ts` line 163, files are saved as `.webp` with `contentType: "image/webp"`, but the actual bytes are PNG (from the AI response). The Supabase render endpoint sees the `.webp` extension, tries to process it as WebP, but the bytes are PNG — causing display failures.

```typescript
// Current (broken):
const path = `menu-items/${venueId}/generated/${item.id}-${Date.now()}.webp`;
// contentType: "image/webp" — but bytes are PNG

// Fixed:
const mimeMatch = base64Url.match(/^data:image\/(\w+);base64,/);
const ext = mimeMatch?.[1] === "png" ? "png" : "webp";
const contentType = `image/${ext}`;
const path = `menu-items/${venueId}/generated/${item.id}-${Date.now()}.${ext}`;
```

**The fallback**: For the `<img>` tag, catch render failures gracefully:
```typescript
<img
  src={optimizedImageUrl(item.image_url, 256, 80, 256)}
  onError={(e) => { e.currentTarget.src = item.image_url!; }}
  // ...
/>
```

This two-pronged approach fixes new images going forward AND makes existing broken images display immediately via the fallback.

