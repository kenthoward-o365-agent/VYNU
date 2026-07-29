// Shared helpers for k6 load tests against Tab-Less / Shyndig.
// k6 runs in its own JS runtime — no Node APIs.
import http from "k6/http";

// No defaults on purpose: a missing env var must abort the run, not silently
// point a load test at whichever backend was hardcoded here.
export const BASE_URL = __ENV.BASE_URL;
export const ANON_KEY = __ENV.ANON_KEY;
if (!BASE_URL || !ANON_KEY) {
  throw new Error(
    "Set BASE_URL and ANON_KEY explicitly, e.g. " +
      "k6 run -e BASE_URL=https://<project-ref>.supabase.co -e ANON_KEY=<publishable-key> ...",
  );
}

// Venue IDs are passed as a comma-separated env var, produced by seed.ts.
export const VENUE_IDS = (__ENV.VENUE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Distribution mode: 'uniform' (worst case, every venue equally hot)
// or 'zipf' (realistic — a handful of venues dominate Friday-night traffic).
export const DISTRIBUTION = (__ENV.DISTRIBUTION || "uniform").toLowerCase();
const ZIPF_ALPHA = Number(__ENV.ZIPF_ALPHA || 1.1);

// Precompute the Zipf CDF over VENUE_IDS once. Index 0 is the hottest venue.
let _zipfCdf = null;
function zipfCdf() {
  if (_zipfCdf) return _zipfCdf;
  const n = VENUE_IDS.length;
  const weights = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = 1 / Math.pow(i + 1, ZIPF_ALPHA);
    weights[i] = w;
    sum += w;
  }
  const cdf = new Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += weights[i] / sum;
    cdf[i] = acc;
  }
  _zipfCdf = cdf;
  return cdf;
}

export function pickVenueUniform() {
  if (VENUE_IDS.length === 0) {
    throw new Error("VENUE_IDS env var is empty — run seed.ts first");
  }
  return VENUE_IDS[Math.floor(Math.random() * VENUE_IDS.length)];
}

export function pickVenueZipf() {
  if (VENUE_IDS.length === 0) {
    throw new Error("VENUE_IDS env var is empty — run seed.ts first");
  }
  const cdf = zipfCdf();
  const r = Math.random();
  // Binary search.
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return VENUE_IDS[lo];
}

export function pickVenue() {
  return DISTRIBUTION === "zipf" ? pickVenueZipf() : pickVenueUniform();
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
