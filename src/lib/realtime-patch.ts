/**
 * Pure helpers for applying Supabase realtime postgres_changes payloads
 * to local lists in-place. Used by Orders.tsx (Phase 3 scaling) so we do not
 * re-fetch the whole list on every event.
 *
 * These are pure functions so they're cheap to unit-test and reuse.
 */

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimePayload<T extends { id: string }> {
  eventType: RealtimeEvent;
  new: Partial<T> & { id?: string };
  old: Partial<T> & { id?: string };
}

/**
 * Apply an UPDATE/DELETE payload to an existing list without re-fetching.
 * INSERT events return the list unchanged — caller should fetch the new row
 * separately because realtime payloads omit joined columns.
 *
 * Behaviour:
 *  - UPDATE: shallow-merge `new` into the matching row (preserves joined
 *    relations like `table` / `order_items` that aren't in the payload).
 *  - DELETE: remove the matching row by id.
 *  - INSERT: returned unchanged. Caller should call `prependFetchedRow`.
 */
export function applyRealtimePatch<T extends { id: string }>(
  list: T[],
  payload: RealtimePayload<T>,
): T[] {
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    if (!id) return list;
    return list.filter((row) => row.id !== id);
  }

  if (payload.eventType === "UPDATE") {
    const id = payload.new?.id ?? payload.old?.id;
    if (!id) return list;
    let changed = false;
    const next = list.map((row) => {
      if (row.id !== id) return row;
      changed = true;
      return { ...row, ...payload.new } as T;
    });
    return changed ? next : list;
  }

  // INSERT — caller fetches the full joined row separately
  return list;
}

/**
 * Insert a freshly-fetched row at the head of the list, replacing any
 * existing row with the same id (idempotent against duplicate events).
 */
export function prependFetchedRow<T extends { id: string }>(list: T[], row: T): T[] {
  const filtered = list.filter((r) => r.id !== row.id);
  return [row, ...filtered];
}

/** True if the realtime event represents row creation. */
export function isInsert<T extends { id: string }>(payload: RealtimePayload<T>): boolean {
  return payload.eventType === "INSERT";
}
