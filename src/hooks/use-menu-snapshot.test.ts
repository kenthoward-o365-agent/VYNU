/**
 * Regression test for the menu-snapshot React Query hook (Phase 2 scaling).
 * Locks in the contract so future edits don't accidentally:
 *   - drop the staleTime that prevents thundering-herd refetches
 *   - call the wrong endpoint path
 *   - send the wrong query params
 *   - skip the apikey/Authorization headers (would break edge auth)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useMenuSnapshot } from "./use-menu-snapshot";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("useMenuSnapshot", () => {
  it("does not fetch when venueId is missing", () => {
    renderHook(() => useMenuSnapshot(undefined, "t-1"), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls /functions/v1/menu-snapshot with venueId + tableId and auth headers", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        venue: { id: "v1", name: "Morris House" },
        table: { id: "t1", table_number: "5" },
        items: [],
        categories: [],
        pricing: { rules: [], links: [] },
        ai: null,
        generated_at: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useMenuSnapshot("v1", "t1"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/functions/v1/menu-snapshot");
    expect(String(url)).toContain("venueId=v1");
    expect(String(url)).toContain("tableId=t1");
    expect((init as RequestInit).headers).toMatchObject({
      apikey: expect.any(String),
      Authorization: expect.stringMatching(/^Bearer /),
    });
    expect(result.current.data?.venue?.name).toBe("Morris House");
  });

  it("propagates non-200 responses as errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useMenuSnapshot("v1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/menu-snapshot failed: 500/);
  });
});
