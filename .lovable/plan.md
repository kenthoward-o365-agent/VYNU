
# Fix the mobile preview properly without more paid test loops

## What the issue actually is

You are right: the mobile preview is still broken, and I should not have kept reporting it as fixed.

The likely root problem is that the Preview button is **not opening the real live QR destination**. In `src/pages/Tables.tsx`, it builds a **relative preview URL**:

```ts
/order/{venueId}/{tableId}
```

That loads inside the Lovable preview environment, not the live published app. So even though the QR codes themselves now point at `https://ordrup.lovable.app/...`, the in-app “Preview” modal is still trying to render the route through the sandbox/preview stack, which is exactly where these auth/proxy/iframe issues can happen.

So the previous `__lovable_token` workaround addressed the wrong layer.

## Plan

### 1. Change the Preview modal to use the actual live QR URL
In `src/pages/Tables.tsx`:

- stop using the current `getPreviewUrl()` relative path for the iframe
- use `table.qr_code` directly when it exists
- otherwise fall back to:
  ```ts
  `${PUBLISHED_BASE_URL}/order/${venue.id}/${table.id}`
  ```

That makes the Preview button match the real sticker destination.

### 2. Remove the preview-token logic
Delete the `__lovable_token` URL-building logic from `getPreviewUrl()` because it is preview-environment specific and not the real path diners use.

### 3. Make the preview resilient instead of pretending it works
Still in `src/pages/Tables.tsx`:

- keep the iframe preview for convenience
- add a clear secondary action like **Open live page**
- show the full live URL in the modal

That way, even if an iframe is blocked or behaves inconsistently in the editor, the user can open the actual destination directly from the modal.

### 4. Keep the layout fix in place
The stacked button layout in the Enlarge dialog was the right fix and should stay.

### 5. Stop using browser-credit verification for this issue
I will not rely on browser automation for this fix unless you explicitly ask again. The next implementation should be code-only and based on the actual route flow, not on another expensive “looks fixed in my test” claim.

## Files to update

- `src/pages/Tables.tsx`

## No backend migration needed
This is now a frontend preview-path issue, not another QR migration issue. Your stored QR URLs were already moved to the live domain.

## Technical detail

Current broken behavior:
```text
Preview button -> /order/{venueId}/{tableId} inside Lovable preview
```

Correct behavior:
```text
Preview button -> table.qr_code
             -> https://ordrup.lovable.app/order/{venueId}/{tableId}
```

## Expected result after implementation

- Preview opens the same destination as the printed QR codes
- No dependency on preview session tokens
- No false positive “fixed” result based on sandbox-only behavior
- If iframe rendering is flaky, the modal still gives a reliable live-page open action
