// Peak profile — Friday-night realistic.
// Targets ~50 concurrent diners across 1,000 venues = 50k VUs.
// k6 cloud / a beefy box is required at this scale; the local runner will
// cap at whatever your machine can handle and report honestly.
import { check, sleep } from "k6";
import { fetchMenuSnapshot, pickVenue } from "./common.js";

const PEAK_VUS = Number(__ENV.PEAK_VUS || 5000); // start small, scale up

export const options = {
  scenarios: {
    peak: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: Math.floor(PEAK_VUS / 2) },
        { duration: "3m", target: PEAK_VUS },
        { duration: "10m", target: PEAK_VUS },
        { duration: "2m", target: 0 },
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
  sleep(30 + Math.random() * 30);
}
