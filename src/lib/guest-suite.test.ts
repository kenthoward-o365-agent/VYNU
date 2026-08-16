import { describe, expect, it } from "vitest";
import {
  bookingConflicts,
  bookingSummary,
  parseClubTiers,
  sortConversations,
  type BookingWindow,
} from "./guest-suite";

const mk = (over: Partial<BookingWindow>): BookingWindow => ({
  id: undefined,
  space_id: "space-1",
  starts_at: "2026-08-20T19:00:00+10:00",
  duration_minutes: 90,
  status: "confirmed",
  ...over,
});

describe("bookingConflicts", () => {
  it("flags an overlapping booking in the same space", () => {
    const existing = [mk({ id: "a" })];
    const candidate = mk({ starts_at: "2026-08-20T19:30:00+10:00" });
    expect(bookingConflicts(existing, candidate)).toHaveLength(1);
  });

  it("ignores other spaces and spaceless bookings", () => {
    const existing = [mk({ id: "a", space_id: "space-2" })];
    expect(bookingConflicts(existing, mk({}))).toHaveLength(0);
    expect(bookingConflicts(existing, mk({ space_id: null }))).toHaveLength(0);
  });

  it("back-to-back bookings that touch exactly do not conflict", () => {
    const existing = [mk({ id: "a" })]; // 19:00 + 90min → ends 20:30
    const candidate = mk({ starts_at: "2026-08-20T20:30:00+10:00" });
    expect(bookingConflicts(existing, candidate)).toHaveLength(0);
  });

  it("cancelled and no-show bookings free their slot", () => {
    const existing = [
      mk({ id: "a", status: "cancelled" }),
      mk({ id: "b", status: "no_show" }),
    ];
    expect(bookingConflicts(existing, mk({}))).toHaveLength(0);
  });

  it("a booking never conflicts with itself when editing", () => {
    const existing = [mk({ id: "a" })];
    expect(bookingConflicts(existing, mk({ id: "a" }))).toHaveLength(0);
  });
});

describe("parseClubTiers", () => {
  it("parses a valid tiers array", () => {
    expect(
      parseClubTiers([
        { key: "member", label: "Member" },
        { key: "vip", label: "VIP" },
      ]),
    ).toEqual([
      { key: "member", label: "Member" },
      { key: "vip", label: "VIP" },
    ]);
  });

  it("falls back to a Member tier on junk input", () => {
    expect(parseClubTiers(null)).toEqual([{ key: "member", label: "Member" }]);
    expect(parseClubTiers("vip")).toEqual([{ key: "member", label: "Member" }]);
    expect(parseClubTiers([{ nope: true }, 42])).toEqual([
      { key: "member", label: "Member" },
    ]);
  });
});

describe("bookingSummary", () => {
  it("formats time, party size and duration", () => {
    const s = bookingSummary("2026-08-20T19:00:00+10:00", 4, 90);
    expect(s).toMatch(/· 4 guests · 90 min$/);
  });

  it("singular guest", () => {
    expect(bookingSummary("2026-08-20T19:00:00+10:00", 1, 60)).toMatch(
      /· 1 guest · 60 min$/,
    );
  });
});

describe("sortConversations", () => {
  it("puts needs_human first, then most recent", () => {
    const sorted = sortConversations([
      { status: "active", last_message_at: "2026-08-16T10:00:00Z" },
      { status: "needs_human", last_message_at: "2026-08-16T08:00:00Z" },
      { status: "active", last_message_at: "2026-08-16T11:00:00Z" },
    ]);
    expect(sorted.map((c) => c.status)).toEqual([
      "needs_human",
      "active",
      "active",
    ]);
    expect(sorted[1].last_message_at).toBe("2026-08-16T11:00:00Z");
  });
});
