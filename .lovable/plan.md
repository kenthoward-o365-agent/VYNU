

# Fix: Landing Page Editor Not Loading Saved Settings

## Root Cause

The `sections` state is initialized via `useState(() => parseSections(venue?.landing_page_html))`. This initializer runs **only once** when the component mounts. If the venue context hasn't finished loading yet (which is common — it's async), `venue` is `null` at mount time, so `parseSections(null)` returns the defaults.

When `venue` later loads with the saved `landing_page_html`, the state has already been set to defaults and never updates.

## Fix

### `src/pages/LandingPageEditor.tsx`

Add a `useEffect` that re-parses sections from `venue?.landing_page_html` when the venue loads. Use a `loaded` ref to ensure it only applies the saved data on the initial load (not after every save), so in-progress edits aren't overwritten.

```typescript
const [sections, setSections] = useState<LandingSection[]>([]);
const initialLoadDone = useRef(false);

useEffect(() => {
  if (venue?.landing_page_html && !initialLoadDone.current) {
    setSections(parseSections(venue.landing_page_html));
    initialLoadDone.current = true;
  } else if (!venue && !initialLoadDone.current) {
    setSections(parseSections(null));
  }
}, [venue?.landing_page_html]);
```

## Files Changed

| File | Change |
|------|--------|
| `src/pages/LandingPageEditor.tsx` | Replace one-shot `useState` initializer with `useEffect` that waits for venue data |

