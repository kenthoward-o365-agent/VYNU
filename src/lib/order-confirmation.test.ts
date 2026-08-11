import { describe, it, expect } from "vitest";
import {
  OPEN_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  isOrderPaid,
  showsProgressTracker,
  showsReceipt,
  type ConfirmableOrder,
  type FulfilmentStatus,
} from "./order-confirmation";

const order = (
  status: FulfilmentStatus,
  payment_status?: string | null,
): ConfirmableOrder => ({ status, payment_status });

describe("isOrderPaid", () => {
  it("is true only for the exact 'paid' payment_status", () => {
    expect(isOrderPaid(order("received", "paid"))).toBe(true);
  });

  it("is false for an unpaid tab round", () => {
    expect(isOrderPaid(order("received", "unpaid"))).toBe(false);
  });

  it("is false for refunded and void orders", () => {
    expect(isOrderPaid(order("served", "refunded"))).toBe(false);
    expect(isOrderPaid(order("served", "void"))).toBe(false);
  });

  it("is false when payment_status is missing or null", () => {
    expect(isOrderPaid(order("received"))).toBe(false);
    expect(isOrderPaid(order("received", null))).toBe(false);
  });

  it("does not infer payment from fulfilment status", () => {
    // The regression this ticket fixes ran the other way — the receipt keyed off
    // fulfilment 'paid'. Neither direction should imply the other.
    expect(isOrderPaid(order("paid", "unpaid"))).toBe(false);
  });

  it("is false for no order at all", () => {
    expect(isOrderPaid(null)).toBe(false);
    expect(isOrderPaid(undefined)).toBe(false);
  });
});

describe("showsReceipt", () => {
  it("shows the receipt immediately after payment, while the kitchen still has the order", () => {
    // The core HLRDRNW-19 case: payment confirmed, fulfilment untouched.
    expect(showsReceipt(order("received", "paid"))).toBe(true);
  });

  it("keeps the receipt through the whole fulfilment run", () => {
    for (const status of ["received", "preparing", "ready", "served"] as FulfilmentStatus[]) {
      expect(showsReceipt(order(status, "paid"))).toBe(true);
    }
  });

  it("does not show a receipt for an order that was never paid", () => {
    expect(showsReceipt(order("received", "unpaid"))).toBe(false);
  });

  it("does not show a receipt for a refused payment left behind at 'received'", () => {
    // cleanupOrder cannot delete the row (RLS grants no DELETE on orders), so a
    // refused payment leaves an order sitting there. It must not read as paid.
    expect(showsReceipt(order("received", "unpaid"))).toBe(false);
  });
});

describe("showsProgressTracker", () => {
  it("tracks while the kitchen has work to do", () => {
    for (const status of ["received", "preparing", "ready"] as FulfilmentStatus[]) {
      expect(showsProgressTracker(order(status, "paid"))).toBe(true);
    }
  });

  it("stops tracking once the order leaves the open statuses", () => {
    for (const status of ["served", "paid", "cancelled", "refunded"] as FulfilmentStatus[]) {
      expect(showsProgressTracker(order(status, "paid"))).toBe(false);
    }
  });

  it("tracks unpaid tab rounds too — paying is a separate axis", () => {
    expect(showsProgressTracker(order("preparing", "unpaid"))).toBe(true);
  });

  it("is false for no order at all", () => {
    expect(showsProgressTracker(null)).toBe(false);
  });
});

describe("the two axes together", () => {
  it("shows tracker and receipt at the same time for a paid, in-progress order", () => {
    const o = order("preparing", "paid");
    expect(showsProgressTracker(o)).toBe(true);
    expect(showsReceipt(o)).toBe(true);
  });

  it("shows neither for a cancelled unpaid order", () => {
    const o = order("cancelled", "unpaid");
    expect(showsProgressTracker(o)).toBe(false);
    expect(showsReceipt(o)).toBe(false);
  });
});

describe("status sets", () => {
  it("keeps open and terminal statuses disjoint", () => {
    for (const status of OPEN_ORDER_STATUSES) {
      expect(TERMINAL_ORDER_STATUSES.has(status)).toBe(false);
    }
  });

  it("treats 'served' as neither open nor terminal — served but not yet closed out", () => {
    expect(OPEN_ORDER_STATUSES).not.toContain("served");
    expect(TERMINAL_ORDER_STATUSES.has("served")).toBe(false);
  });
});
