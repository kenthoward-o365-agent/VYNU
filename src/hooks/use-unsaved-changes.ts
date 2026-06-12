import { useEffect } from "react";

/**
 * Guards against losing in-flight form edits.
 *
 * - When `dirty` is true, the browser shows the native "Leave site?" prompt
 *   if the user closes the tab, refreshes, or navigates the window away.
 * - Switching to another browser tab and returning does NOT trigger this —
 *   that case is handled globally by VenueContext (no refetch on token refresh).
 * - For in-app navigation guards, call `confirmDiscard()` before router pushes.
 */
export function useUnsavedChanges(dirty: boolean, message = "You have unsaved changes. Leave anyway?") {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, message]);

  return {
    /** Call before navigating away inside the app. Returns true if safe to proceed. */
    confirmDiscard: () => !dirty || window.confirm(message),
  };
}
