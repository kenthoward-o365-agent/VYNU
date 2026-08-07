/**
 * The point of these boundaries is that a diner mid-order never sees a blank
 * white screen, and is told the truth about whether their order went through.
 * Both are asserted here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";
import ErrorBoundary from "./ErrorBoundary";
import { AppErrorFallback, ConsumerErrorFallback } from "./ErrorFallbacks";

const Boom = (): React.ReactElement => {
  throw new Error("kaboom");
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  // React logs caught render errors itself; silence it so the suite output
  // reflects real failures only.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function renderConsumerAt(path: string) {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/order/:venueId/:tableId",
          element: React.createElement(
            ErrorBoundary,
            { scope: "consumer-order", fallback: ConsumerErrorFallback },
            React.createElement(Boom),
          ),
        }),
      ),
    ),
  );
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { scope: "test", fallback: AppErrorFallback },
        React.createElement("p", null, "all good"),
      ),
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the fallback instead of unmounting the tree on a render error", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { scope: "app-root", fallback: AppErrorFallback },
        React.createElement(Boom),
      ),
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload the page/i })).toBeInTheDocument();
  });

  it("logs the scope and component stack", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { scope: "app-root", fallback: AppErrorFallback },
        React.createElement(Boom),
      ),
    );
    const logged = consoleErrorSpy.mock.calls.find(
      (c) => c[0] === "[ErrorBoundary] uncaught render error",
    );
    expect(logged).toBeTruthy();
    expect(logged![1]).toMatchObject({ scope: "app-root", message: "kaboom" });
    expect(logged![1]).toHaveProperty("componentStack");
  });
});

describe("ConsumerErrorFallback", () => {
  it("says the order was NOT placed when no order marker exists", () => {
    renderConsumerAt("/order/v-1/t-1");
    expect(screen.getByText(/your order has not been placed/i)).toBeInTheDocument();
    expect(screen.getByText(/haven't been charged/i)).toBeInTheDocument();
  });

  it("says the order WAS placed when the marker is present for that table", () => {
    localStorage.setItem("shyndig.lastOrder.v-1.t-1", "order-123");
    renderConsumerAt("/order/v-1/t-1");
    expect(screen.getByText(/your order was placed/i)).toBeInTheDocument();
    expect(screen.getByText(/don't need to order again/i)).toBeInTheDocument();
  });

  it("does not read another table's order marker", () => {
    localStorage.setItem("shyndig.lastOrder.v-1.t-OTHER", "order-999");
    renderConsumerAt("/order/v-1/t-1");
    expect(screen.getByText(/your order has not been placed/i)).toBeInTheDocument();
  });

  it("always offers a reload action", () => {
    renderConsumerAt("/order/v-1/t-1");
    expect(screen.getByRole("button", { name: /^reload$/i })).toBeInTheDocument();
  });
});
