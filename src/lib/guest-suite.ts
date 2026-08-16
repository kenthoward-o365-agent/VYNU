// Pure helpers for the guest-suite modules (Reserve, Functions, Concierge,
// Club, Discover). Kept out of the pages so they can be unit-tested.

/** Booking statuses a booking can move to from each status. */
export const BOOKING_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["seated", "cancelled", "no_show"],
  seated: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "quoted",
  "confirmed",
  "lost",
  "completed",
] as const;

export interface BookingWindow {
  id?: string;
  space_id: string | null;
  starts_at: string; // ISO
  duration_minutes: number;
  status: string;
}

/** Statuses that occupy a slot — cancelled/no-show bookings free theirs. */
const OCCUPYING = new Set(["pending", "confirmed", "seated"]);

/**
 * True when `candidate` overlaps an existing occupying booking in the same
 * space. Bookings without a space never conflict (the venue floor is not
 * modelled); neither do back-to-back bookings that touch exactly.
 */
export function bookingConflicts(
  existing: BookingWindow[],
  candidate: BookingWindow,
): BookingWindow[] {
  if (!candidate.space_id) return [];
  const cStart = new Date(candidate.starts_at).getTime();
  const cEnd = cStart + candidate.duration_minutes * 60_000;
  if (Number.isNaN(cStart)) return [];
  return existing.filter((b) => {
    if (b.id && candidate.id && b.id === candidate.id) return false;
    if (b.space_id !== candidate.space_id) return false;
    if (!OCCUPYING.has(b.status)) return false;
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = bStart + b.duration_minutes * 60_000;
    return bStart < cEnd && cStart < bEnd;
  });
}

export interface ClubTier {
  key: string;
  label: string;
}

/** Parse a program's tiers JSONB defensively — bad data must not crash the UI. */
export function parseClubTiers(raw: unknown): ClubTier[] {
  if (!Array.isArray(raw)) return [{ key: "member", label: "Member" }];
  const tiers = raw
    .filter(
      (t): t is { key: string; label: string } =>
        !!t &&
        typeof t === "object" &&
        typeof (t as Record<string, unknown>).key === "string" &&
        typeof (t as Record<string, unknown>).label === "string",
    )
    .map((t) => ({ key: t.key, label: t.label }));
  return tiers.length > 0 ? tiers : [{ key: "member", label: "Member" }];
}

/** "7:00 pm · 4 guests · 90 min" — the deck's booking one-liner. */
export function bookingSummary(
  startsAt: string,
  partySize: number,
  durationMinutes: number,
): string {
  const d = new Date(startsAt);
  const time = d.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${time} · ${partySize} ${partySize === 1 ? "guest" : "guests"} · ${durationMinutes} min`;
}

/** Concierge conversation ordering: needs_human first, then most recent. */
export function sortConversations<
  T extends { status: string; last_message_at: string },
>(convs: T[]): T[] {
  return [...convs].sort((a, b) => {
    const aUrgent = a.status === "needs_human" ? 0 : 1;
    const bUrgent = b.status === "needs_human" ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    return (
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime()
    );
  });
}
