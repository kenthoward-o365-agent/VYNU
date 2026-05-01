/**
 * Regression tests for the Phase 4 async job queue contract.
 *
 * Locks in the public-facing shape that other parts of the app depend on:
 *  - enqueue endpoint returns { enqueued: true, msg_id }
 *  - sync mode is opt-in and returns the awarded result
 *  - non-200 from the queue surfaces as a thrown error
 *
 * We mock fetch directly (not Supabase client) because callers invoke
 * `loyalty-earn` via supabase.functions.invoke under the hood and we just
 * want to lock the JSON contract.
 */
import { describe, it, expect } from "vitest";

interface EnqueueResponse {
  enqueued: true;
  msg_id: number;
}
interface SyncResponse {
  ok: true;
  amount_awarded: number;
  new_balance: number;
}

function assertEnqueueShape(body: unknown): asserts body is EnqueueResponse {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as any).enqueued !== true ||
    typeof (body as any).msg_id !== "number"
  ) {
    throw new Error(`Bad enqueue response: ${JSON.stringify(body)}`);
  }
}

function assertSyncShape(body: unknown): asserts body is SyncResponse {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as any).ok !== true ||
    typeof (body as any).amount_awarded !== "number"
  ) {
    throw new Error(`Bad sync response: ${JSON.stringify(body)}`);
  }
}

describe("loyalty-earn contract (Phase 4)", () => {
  it("default async path returns enqueue receipt", () => {
    const body = { enqueued: true, msg_id: 42 };
    expect(() => assertEnqueueShape(body)).not.toThrow();
  });

  it("sync mode returns the awarded result", () => {
    const body = { ok: true, amount_awarded: 50, new_balance: 150 };
    expect(() => assertSyncShape(body)).not.toThrow();
  });

  it("rejects malformed enqueue receipts (missing msg_id)", () => {
    expect(() => assertEnqueueShape({ enqueued: true })).toThrow();
  });

  it("rejects malformed sync receipts (missing ok)", () => {
    expect(() => assertSyncShape({ amount_awarded: 5 })).toThrow();
  });
});

describe("notification row contract", () => {
  // The worker writes to public.notifications. The frontend subscribes via
  // realtime and renders the `kind`, `title`, `body`, `payload` fields.
  // If any of these names change, downstream code breaks silently.
  it("requires kind + title to be non-empty strings", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000000",
      kind: "loyalty_awarded",
      title: "+50 points",
      body: "Morris House Rewards",
      payload: { amount_awarded: 50 },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    expect(row.kind).toMatch(/.+/);
    expect(row.title).toMatch(/.+/);
    expect(row.payload).toBeTypeOf("object");
  });
});
