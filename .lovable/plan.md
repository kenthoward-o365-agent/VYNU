

# Fix Zoomed-In Menu Item Thumbnails

## Problem
The `optimizedImageUrl` helper requests `width=128` but no `height`. For non-square source images, the Supabase render endpoint returns images with mismatched aspect ratios. Combined with `object-cover` on 48×48 / 64×64 CSS containers, this crops aggressively — making images look "zoomed in."

## Fixes

### 1. Update `optimizedImageUrl` in `src/lib/image-utils.ts`
- Add an optional `height` parameter
- When both `width` and `height` are provided, append `&height=N&resize=contain` to the transform URL — this ensures the image fits within bounds without cropping
- Increase default quality slightly (75 → 80) for better visual fidelity at small sizes

### 2. Update `MenuFeed.tsx` thumbnail rendering
- Request **256px** width instead of 128px — this properly serves 64px containers on 3x retina displays and avoids the pixelated/zoomed look
- For the full-card mobile view, keep 640px
- Change `object-cover` to `object-contain` on the thumbnail `<img>` to prevent aggressive cropping, with a subtle background fill behind the image

### 3. Update `MenuFeed.tsx` mobile card view
- Ensure the large hero image in the swipe card also uses the correct transform parameters

## Files changed
| File | Change |
|------|--------|
| `src/lib/image-utils.ts` | Add `height` param, use `resize=contain` |
| `src/components/consumer/MenuFeed.tsx` | Request 256px thumbnails, adjust `object-fit` to prevent aggressive cropping |

