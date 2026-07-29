// Smoke profile — sanity check (~5 min, ~10 venues, ~20 diners).
// Run: k6 run -e BASE_URL=https://<project-ref>.supabase.co -e ANON_KEY=<key> \
//        -e VENUE_IDS=$(cat scripts/loadtest/.venue-ids) scripts/loadtest/k6/smoke.js
import { check, sleep } from "k6";
import { fetchMenuSnapshot, pickVenue } from "./common.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "3m", target: 20 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    "http_req_duration{name:menu-snapshot}": ["p(95)<600"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const venueId = pickVenue();
  const res = fetchMenuSnapshot(venueId);
  check(res, {
    "menu 200": (r) => r.status === 200,
    "menu has items": (r) => {
      try {
        const j = r.json();
        return Array.isArray(j.items) || Array.isArray(j.menu_items);
      } catch (_) {
        return false;
      }
    },
  });
  // Diner browses for ~20-40s before next scan in this VU.
  sleep(20 + Math.random() * 20);
}
