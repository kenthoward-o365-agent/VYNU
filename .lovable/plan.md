

## Plan: AI Image Enhancer for Menu Items

### Summary
Add an "Enhance Images" feature under AI Features in the Menu Builder sidebar. When run, it fetches all menu item images that haven't been reviewed yet, sends each through Lovable AI's image editing capability (Gemini flash image model), shows before/after comparisons, and lets the operator accept enhancements individually, in bulk, or all at once.

### Database change
Add a column to `menu_items` to track enhancement status:

```sql
ALTER TABLE public.menu_items
  ADD COLUMN image_ai_status text DEFAULT NULL;
-- NULL = not reviewed, 'enhanced' = accepted, 'skipped' = manually skipped
```

This lets future runs skip already-reviewed images.

### Edge Function: `enhance-menu-image`
- Accepts: `{ imageUrl: string }` (the public URL of the original image)
- Uses Lovable AI (model `google/gemini-3.1-flash-image-preview`) with the prompt: "Enhance this food/drink photo for a mobile menu. Improve lighting, color vibrancy, sharpness, and composition. Keep the subject identical."
- Returns the enhanced image as base64
- The client uploads the result to `venue-assets` storage bucket under `menu-items/{venue_id}/enhanced/`

### Frontend: New page/dialog at `/menu?enhance=true`

1. **Sidebar link** — Add "Enhance Images" under "AI Features" in `DashboardLayout.tsx` (next to Import), linking to `/menu?enhance=true`

2. **Enhancement dialog in `MenuBuilder.tsx`** — Opens when `?enhance=true` is detected (same pattern as import). Contains:
   - A grid of before/after image cards for each menu item that has an `image_url` and `image_ai_status IS NULL`
   - Each card shows: item name, original image (left), enhanced image (right), and a checkbox
   - A "Run Enhancement" button that processes all unreviewed images sequentially (with a progress bar)
   - Toolbar with "Select All" checkbox and "Accept Selected" button
   - Accepting updates `menu_items.image_url` to the enhanced version and sets `image_ai_status = 'enhanced'`
   - A "Skip" option per item sets `image_ai_status = 'skipped'`

3. **Flow:**
   - User clicks "Enhance Images" in sidebar
   - Dialog opens showing count of unreviewed images
   - User clicks "Run" — images are processed one by one via the edge function, progress bar updates
   - After processing, before/after grid appears
   - User checks items to accept, clicks "Accept Selected"
   - Accepted items get their `image_url` replaced and `image_ai_status` set

### Files to create/modify
- **New**: `supabase/functions/enhance-menu-image/index.ts` — Edge function calling Lovable AI image edit
- **Migration**: Add `image_ai_status` column to `menu_items`
- **Modified**: `src/components/DashboardLayout.tsx` — Add "Enhance Images" link under AI Features
- **Modified**: `src/pages/MenuBuilder.tsx` — Add enhancement dialog with before/after grid, checkboxes, and accept flow

### Technical details
- Uses `google/gemini-3.1-flash-image-preview` (fast image generation with pro-level quality) via `--edit-image` pattern
- Enhanced images stored at `venue-assets/menu-items/{venue_id}/enhanced/{timestamp}.png`
- Original images are preserved (only the `image_url` reference changes on acceptance)
- Items with no image are skipped automatically
- Rate limiting: sequential processing with 1-2s delay between items to avoid 429s

