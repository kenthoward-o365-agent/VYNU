

## Fix dietary filter showing "86'd" badge + rename label

### Bug
In `src/components/consumer/MenuFeed.tsx`, the row uses:
```ts
const isAvailable = (item.is_available ?? true) && !dimmed;
```
So when a diner toggles a dietary filter (e.g. Vegan), every non-matching item gets `dimmed=true` and is incorrectly tagged with the red "86'd" destructive badge — as if the kitchen pulled it.

### Changes

**`src/components/consumer/MenuFeed.tsx`**
1. Decouple availability from the filter dim state:
   - `const isAvailable = item.is_available ?? true;` — true availability only.
   - Keep `dimmed` purely for the visual greyed-out effect (opacity), no badge.
2. Rename the badge label from `86'd` → `Temporarily Not Available` (correct spelling). Keep the `Ban` icon and destructive variant. Adjust spacing slightly so the longer label fits cleanly on the row (single line, smaller padding).
3. Apply the opacity-50 class when either `!isAvailable` **or** `dimmed` is true (so filtered-out items still grey out as today).

### Out of scope
- No changes to `ItemDetailScreen.tsx` (it doesn't render the 86'd badge).
- No operator-side terminology changes — staff still see "86'd" internally where applicable.
- No DB or filter-logic changes.

### Result
- Filtering by Vegan greys out non-vegan items (no red badge).
- Only items the venue has actually marked unavailable show the red **Temporarily Not Available** badge.

