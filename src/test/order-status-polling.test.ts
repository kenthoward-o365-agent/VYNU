import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit test for the diner order-status polling fallback contract:
 * the page should be able to recover the latest status via the
 * `get_diner_order_status` RPC even when no realtime UPDATE arrives.
 *
 * We don't render the page here — we exercise the smallest useful contract:
 * given a sequence of RPC responses, a polling loop converges to the latest
 * status and stops on terminal.
 */

const TERMINAL = new Set(["paid", "cancelled", "refunded"]);

async function pollUntilTerminal(
  rpc: () => Promise<{ data: any[] | null }>,
  onUpdate: (row: any) => void,
  intervalMs = 5,
  maxIterations = 50,
) {
  for (let i = 0; i < maxIterations; i++) {
    const { data } = await rpc();
    const row = data?.[0];
    if (row) {
      onUpdate(row);
      if (TERMINAL.has(row.status)) return "terminal";
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "max-iterations";
}

describe("diner order status polling fallback", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("recovers status updates and stops on terminal", async () => {
    const sequence = [
      { id: "o1", status: "received", total: 10, created_at: "" },
      { id: "o1", status: "preparing", total: 10, created_at: "" },
      { id: "o1", status: "ready", total: 10, created_at: "" },
      { id: "o1", status: "paid", total: 10, created_at: "" },
      { id: "o1", status: "paid", total: 10, created_at: "" },
    ];
    let i = 0;
    const rpc = vi.fn(async () => ({ data: [sequence[Math.min(i++, sequence.length - 1)]] }));
    const updates: string[] = [];

    const result = await pollUntilTerminal(rpc, (row) => updates.push(row.status));

    expect(result).toBe("terminal");
    expect(updates.at(-1)).toBe("paid");
    expect(updates).toContain("preparing");
    expect(updates).toContain("ready");
  });

  it("survives transient RPC failures", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: [{ id: "o2", status: "preparing" }] })
      .mockResolvedValue({ data: [{ id: "o2", status: "paid" }] });
    const updates: string[] = [];
    const result = await pollUntilTerminal(rpc, (r) => updates.push(r.status));
    expect(result).toBe("terminal");
    expect(updates.at(-1)).toBe("paid");
  });
});
