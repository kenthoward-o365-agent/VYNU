/**
 * Contract tests for the guest-side package gating hook.
 *
 * The important one is fail-open on a missing package row. This hook must
 * resolve identically to hasFeature() in supabase/functions/_shared/require-feature.ts,
 * because the endpoints enforce independently. If the two disagree, a venue
 * gets features hidden in the UI but still served by the API (or the reverse),
 * which is the bug HLRDRNW-96 exists to fix.
 *
 * Three production venues currently have no package row, including the RFP demo
 * venue, so a fail-closed default here would silently strip their features.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGuestFeatures } from "./use-guest-features";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

beforeEach(() => {
  rpcMock.mockReset();
});

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const ok = (rows: unknown) => ({ data: rows, error: null });

describe("useGuestFeatures", () => {
  it("does not call the RPC when venueId is undefined", () => {
    renderHook(() => useGuestFeatures(undefined), { wrapper: wrapper() });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls get_venue_package_public with the venue id", async () => {
    rpcMock.mockResolvedValue(ok([]));
    renderHook(() => useGuestFeatures("v-1"), { wrapper: wrapper() });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledWith("get_venue_package_public", { _venue_id: "v-1" });
  });

  it("fails OPEN when the venue has no package row, matching the server default", async () => {
    rpcMock.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useGuestFeatures("v-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has("ai.chat_ordering")).toBe(true);
    expect(result.current.has("ai.upsell")).toBe(true);
  });

  it("fails OPEN when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => useGuestFeatures("v-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has("ai.upsell")).toBe(true);
  });

  it("honours an explicit false override on feast (the HLRDRNW-96 case)", async () => {
    rpcMock.mockResolvedValue(
      ok([{ tier: "feast", flags: { "ai.chat_ordering": false, "ai.upsell": false } }]),
    );
    const { result } = renderHook(() => useGuestFeatures("v-shed"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has("ai.chat_ordering")).toBe(false);
    expect(result.current.has("ai.upsell")).toBe(false);
    // Untouched keys on feast stay on.
    expect(result.current.has("core.menu_builder")).toBe(true);
  });

  it("resolves a lower tier from its preset, with overrides winning", async () => {
    rpcMock.mockResolvedValue(ok([{ tier: "bite", flags: { "ai.upsell": false } }]));
    const { result } = renderHook(() => useGuestFeatures("v-2"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // In the bite preset but explicitly overridden off.
    expect(result.current.has("ai.upsell")).toBe(false);
    // In the bite preset, untouched.
    expect(result.current.has("ai.chat_ordering")).toBe(true);
    // Not in the bite preset.
    expect(result.current.has("ai.menu_import")).toBe(false);
  });

  it("treats an unknown tier as feast rather than throwing", async () => {
    rpcMock.mockResolvedValue(ok([{ tier: "enterprise-2027", flags: {} }]));
    const { result } = renderHook(() => useGuestFeatures("v-3"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(() => result.current.has("ai.upsell")).not.toThrow();
    expect(result.current.has("ai.upsell")).toBe(true);
  });

  it("reports features as available while the lookup is in flight", () => {
    rpcMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGuestFeatures("v-1"), { wrapper: wrapper() });
    expect(result.current.loading).toBe(true);
    expect(result.current.has("ai.chat_ordering")).toBe(true);
  });
});
