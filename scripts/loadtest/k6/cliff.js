// Cliff profile — find the breaking point.
// 1,000 venues × 200 diners concurrent = 200k VUs target.
// You almost certainly need k6 cloud or a distributed runner for this.
// Locally it will saturate the runner first; that's fine — the goal is
// to find where THE BACKEND breaks, so push until thresholds fail.
import { check, sleep } from "k6";
import { fetchMenuSnapshot, pickVenue } from "./common.js";

const CLIFF_VUS = Number(__ENV.CLIFF_VUS || 20000);

export const options = {
  scenarios: {
    cliff: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5m", target: Math.floor(CLIFF_VUS / 4) },
        { duration: "5m", target: Math.floor(CLIFF_VUS / 2) },
        { duration: "5m", target: CLIFF_VUS },
        { duration: "10m", target: CLIFF_VUS },
        { duration: "3m", target: 0 },
      ],
      gracefulRampDown: "1m",
    },
  },
  // No hard thresholds — we WANT to see the cliff in the report.
  thresholds: {
    http_req_failed: ["rate<0.10"], // alarm only if >10% fail
  },
};

export default function () {
  const venueId = pickVenue();
  const res = fetchMenuSnapshot(venueId);
  check(res, { "menu ok": (r) => r.status < 500 });
  sleep(5 + Math.random() * 10);
}
