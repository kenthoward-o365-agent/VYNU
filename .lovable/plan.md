

# Optimize Menu Item Image Sizes for Fast Loading

## Problem
Both the AI enhancement and generation flows upload images as **raw PNG at full AI output resolution** (often 1024×1024+ pixels, 2-5MB each). The consumer menu feed displays these at **48×48 to 64×64 CSS pixels** (thumbnails). Full-size PNGs are downloaded for tiny thumbnails, causing slow page loads — especially on mobile with multiple items.

## Root Cause
- `ImageEnhancerDialog.tsx` line 176: uploads enhanced images as `image/png` blobs with zero compression or resizing
- `batch-generate-images/index.ts` line 166: uploads generated images as raw PNG bytes with no processing
- `MenuFeed.tsx`: no `loading="lazy"` on `<img>` tags, so all images load eagerly on mount

## Fixes

### 1. Client-side: Resize & convert to WebP before upload (enhance flow)
In `ImageEnhancerDialog.tsx`, add a helper that draws the base64 image onto a canvas, resizes to max 800px on the longest side, and exports as WebP at 80% quality. This typically reduces a 3MB PNG to ~60-120KB WebP. Apply this before the storage upload in `acceptSelected()`.

### 2. Edge function: Resize & convert to WebP before upload (generate flow)
In `batch-generate-images/index.ts`, after receiving the AI base64 image, resize and convert to WebP server-side before uploading. Since Deno edge functions have limited image processing, we'll use the canvas-free approach: upload as WebP by re-encoding via a lightweight Deno image library, or — more practically — add a `resizeAndConvert` step using the browser-native `OffscreenCanvas` equivalent. Since edge functions lack canvas, we'll use the `sharp`-like approach via Wasm or simply reduce quality by re-requesting the AI at a smaller output size.

**Pragmatic approach for edge functions**: Since Deno edge functions can't easily do image processing, we'll instead have the client-side do a one-time migration of existing oversized images, and for new generations, we'll add a post-processing step in the enhance dialog that also handles generated images when they're reviewed.

### 3. Consumer feed: Add lazy loading + smaller display optimization
In `MenuFeed.tsx`, add `loading="lazy"` and explicit `width`/`height` attributes to all `<img>` tags to enable browser-native lazy loading and prevent layout shift.

### 4. Add a Supabase image transform URL parameter
Supabase Storage supports image transforms via URL parameters. Instead of resizing at upload time, we can append `?width=128&quality=75` to image URLs when rendering thumbnails. This is the fastest fix and works retroactively on all existing images.

## Recommended Approach (simplest, retroactive)
Use **Supabase Storage image transforms** at render time (option 4) + **lazy loading** (option 3) + **WebP conversion at upload** (option 1) for new images going forward.

### Files to change

| File | Change |
|------|--------|
| `src/components/consumer/MenuFeed.tsx` | Append transform params to image URLs, add `loading="lazy"` |
| `src/components/consumer/VenueLanding.tsx` | Same transform params for any menu images shown |
| `src/components/menu/ImageEnhancerDialog.tsx` | Resize to 800px max + convert to WebP before upload |
| `supabase/functions/batch-generate-images/index.ts` | Upload as WebP instead of PNG (simple content-type change since AI already returns compressed data) |

### Technical detail — image transform helper
```typescript
function optimizedImageUrl(url: string, width: number): string {
  if (!url || !url.includes('/storage/v1/object/public/')) return url;
  const base = url.split('?')[0];
  return `${base}?width=${width}&quality=75&format=webp`;
}
```

This works on all existing images immediately — no migration needed.

