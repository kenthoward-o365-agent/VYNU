// Tracks an "active diner visit" in sessionStorage so that closing the tab
// (or browser) ends the visit, even if Supabase still has a valid auth token.
// Re-opening the QR after a tab close forces a "Continue as {Name}?" gate.

const key = (venueId: string) => `shyndig:diner_visit:${venueId}`;

export interface DinerVisit {
  dinerId: string;
  startedAt: number;
}

export function readDinerVisit(venueId?: string | null): DinerVisit | null {
  if (!venueId || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(venueId));
    if (!raw) return null;
    return JSON.parse(raw) as DinerVisit;
  } catch {
    return null;
  }
}

export function writeDinerVisit(venueId: string, dinerId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      key(venueId),
      JSON.stringify({ dinerId, startedAt: Date.now() } satisfies DinerVisit)
    );
  } catch {}
}

export function clearDinerVisit(venueId?: string | null) {
  if (!venueId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key(venueId));
  } catch {}
}
