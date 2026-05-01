import { describe, it, expect } from "vitest";
import {
  applyRealtimePatch,
  prependFetchedRow,
  isInsert,
  type RealtimePayload,
} from "@/lib/realtime-patch";

interface Row {
  id: string;
  status: string;
  total: number;
  // Joined relation that realtime payload never includes —
  // patching must preserve it.
  table?: { table_number: string } | null;
}

const seed: Row[] = [
  { id: "a", status: "received", total: 10, table: { table_number: "1" } },
  { id: "b", status: "preparing", total: 20, table: { table_number: "2" } },
  { id: "c", status: "ready", total: 30, table: { table_number: "3" } },
];

describe("applyRealtimePatch", () => {
  it("UPDATE shallow-merges changed columns and preserves joined relations", () => {
    const payload: RealtimePayload<Row> = {
      eventType: "UPDATE",
      new: { id: "b", status: "ready" },
      old: { id: "b", status: "preparing" },
    };
    const next = applyRealtimePatch(seed, payload);
    expect(next).not.toBe(seed);
    expect(next[1]).toEqual({
      id: "b",
      status: "ready",
      total: 20,
      table: { table_number: "2" }, // joined relation preserved
    });
    // other rows untouched (referential equality)
    expect(next[0]).toBe(seed[0]);
    expect(next[2]).toBe(seed[2]);
  });

  it("UPDATE returns the same array when id is missing or unmatched", () => {
    const noMatch: RealtimePayload<Row> = {
      eventType: "UPDATE",
      new: { id: "zzz", status: "ready" },
      old: { id: "zzz" },
    };
    expect(applyRealtimePatch(seed, noMatch)).toBe(seed);
  });

  it("DELETE removes the matching row by old.id", () => {
    const payload: RealtimePayload<Row> = {
      eventType: "DELETE",
      new: {},
      old: { id: "a" },
    };
    const next = applyRealtimePatch(seed, payload);
    expect(next).toHaveLength(2);
    expect(next.find((r) => r.id === "a")).toBeUndefined();
  });

  it("INSERT returns the list unchanged (caller must fetch the joined row)", () => {
    const payload: RealtimePayload<Row> = {
      eventType: "INSERT",
      new: { id: "d", status: "received" },
      old: {},
    };
    expect(applyRealtimePatch(seed, payload)).toBe(seed);
    expect(isInsert(payload)).toBe(true);
  });
});

describe("prependFetchedRow", () => {
  it("prepends a new row at the head", () => {
    const newRow: Row = { id: "d", status: "received", total: 5, table: null };
    const next = prependFetchedRow(seed, newRow);
    expect(next[0]).toBe(newRow);
    expect(next).toHaveLength(4);
  });

  it("is idempotent — duplicate insert events do not double-add", () => {
    const dup: Row = { id: "a", status: "received", total: 99, table: null };
    const next = prependFetchedRow(seed, dup);
    expect(next).toHaveLength(3);
    expect(next[0]).toBe(dup); // newer row wins, ends up at head
    expect(next.filter((r) => r.id === "a")).toHaveLength(1);
  });
});
