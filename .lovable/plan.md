

# Fix: Preview Button Overflow & Dialog Not Working

## Problems

1. **Button overflow**: Three buttons (Download, Enlarge, Preview) in a `flex gap-2` row with `flex-1` — on narrow cards they overflow the card border.
2. **Preview dialog closes immediately**: The `DialogContent` uses `flex-1` on the inner div but `DialogContent` isn't a flex container, so `MobilePreviewFrame` gets zero height and the iframe renders invisible / the dialog appears empty and closes.

## Fix

### `src/pages/Tables.tsx`

**Card buttons** — Stack into two rows: first row for Download + Enlarge, second row for Preview (full width). This prevents overflow on narrow cards.

```
<div className="space-y-2">
  <div className="flex gap-2">
    <Button ...>Download</Button>
    <Button ...>Enlarge</Button>
  </div>
  <Button variant="default" size="sm" className="w-full text-xs" ...>
    <Smartphone /> Preview
  </Button>
</div>
```

**Preview dialog** — Add `flex flex-col` to `DialogContent` so `flex-1` works on the inner div, giving the iframe actual height:

```
<DialogContent className="max-w-[480px] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
```

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Tables.tsx` | Split 3-button row into 2 rows; add `flex flex-col` to preview dialog content |

