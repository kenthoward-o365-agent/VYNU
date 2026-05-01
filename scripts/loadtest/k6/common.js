// Shared helpers for k6 load tests against Tab-Less / Shyndig.
// k6 runs in its own JS runtime — no Node APIs.
import http from "k6/http";

export const BASE_URL = __ENV.BASE_URL || "https://jsbxivkgfekcgvtyqnek.supabase.co";
export const ANON_KEY =
  __ENV.ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzYnhpdmtnZmVrY2d2dHlxbmVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjgzNzcsImV4cCI6MjA5MTE0NDM3N30.Ra4q3O22JrZrgcrpAPFR3txp9T8ZPOk0vyU0ivy_7Ck";

// Venue IDs are passed as a comma-separated env var, produced by seed.ts.
export const VENUE_IDS = (__ENV.VENUE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function pickVenue() {
  if (VENUE_IDS.length === 0) {
    throw new Error("VENUE_IDS env var is empty — run seed.ts first");
  }
  return VENUE_IDS[Math.floor(Math.random() * VENUE_IDS.length)];
}

export function authHeaders() {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export function fetchMenuSnapshot(venueId) {
  const url = `${BASE_URL}/functions/v1/menu-snapshot?venueId=${venueId}`;
  const res = http.get(url, { headers: authHeaders(), tags: { name: "menu-snapshot" } });
  return res;
}
