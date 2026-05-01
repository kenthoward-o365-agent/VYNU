// Compact Peak profile — fits inside the sandbox 10-min exec ceiling.
// Same shape as peak.js, shorter stages, slightly tighter sleep so we
// produce a representative sample rather than a 17-minute soak.
// For real Friday-night-soak runs use peak.js.
import { check, sleep } from "k6";
import { fetchMenuSnapshot, pickVenue } from "./common.js";

const PEAK_VUS = Number(__ENV.PEAK_VUS || 1500);

export const options = {
  scenarios: {
    peak: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: Math.floor(PEAK_VUS / 2) },
        { duration: "1m", target: PEAK_VUS },
        { duration: "5m", target: PEAK_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    "http_req_duration{name:menu-snapshot}": ["p(95)<800", "p(99)<1500"],
    http_req_failed: ["rate<0.02"],
  },
};

export default function () {
  const venueId = pickVenue();
  const res = fetchMenuSnapshot(venueId);
  check(res, { "menu 200": (r) => r.status === 200 });
  // Diner browses 15-30s before next scan in this VU.
  sleep(15 + Math.random() * 15);
}
