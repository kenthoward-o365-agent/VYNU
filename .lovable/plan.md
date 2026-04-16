

# Fix QR Code URLs and Enlarge Dialog Layout

## Problem Summary

1. **QR codes still point to old domain**: All 12 Morris House tables have `qr_code` values stored as `https://sippaai.lovable.app/order/...`. The code constant `PUBLISHED_BASE_URL` is also still `"https://sippaai.lovable.app"`. The published URL is now `https://ordrup.lovable.app`.

2. **Enlarge dialog overflow**: The QR zoom dialog (`max-w-sm`) has three buttons (Download SVG, Print, Preview) in a single `flex gap-2` row that bleeds outside the dialog on narrower viewports.

## Changes

### 1. Update `PUBLISHED_BASE_URL` in `src/pages/Tables.tsx`
Change line 16 from `"https://sippaai.lovable.app"` to `"https://ordrup.lovable.app"`.

### 2. Migrate existing QR code URLs in the database
Run a data update (via the insert tool) to replace the old domain in all stored `qr_code` values:
```sql
UPDATE tables
SET qr_code = REPLACE(qr_code, 'https://sippaai.lovable.app', 'https://ordrup.lovable.app')
WHERE qr_code LIKE '%sippaai.lovable.app%';
```

### 3. Fix Enlarge dialog button overflow
In the QR zoom dialog (lines 239-249 of `Tables.tsx`), change the three-button row from `flex gap-2` to a stacked layout:
```tsx
<div className="flex flex-col gap-2 mt-2">
  <div className="flex gap-2">
    <Button variant="outline" className="flex-1" ...>Download SVG</Button>
    <Button variant="outline" className="flex-1" ...>Print</Button>
  </div>
  <Button className="w-full" ...>Preview</Button>
</div>
```

### 4. Update memory files
- Update `mem://constraints/qr-codes-permanent` to reflect the new URL format (`https://ordrup.lovable.app/order/...`).
- Update `mem://index.md` core section if needed.

## Impact
- All existing Morris House QR codes will point to the new domain
- New tables added in the future will also use the correct domain
- The Enlarge dialog buttons will no longer overflow

