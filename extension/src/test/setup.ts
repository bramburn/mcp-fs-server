import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, vi } from "vitest";

/**
 * setup.ts — lightweight DOM-oriented setup.
 *
 * Per the implementation plan:
 * - Do NOT reconstruct a full `process` object here (that belongs in global-setup).
 * - Keep only DOM / UI mocks and small guards.
 * - Ensure vscode mock is assigned idempotently.
 */

// Mock ResizeObserver for UI components (only in jsdom-based tests)
(global as any).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollIntoView for UI components (JSDOM does not implement this)
if (typeof window !== "undefined" && (window as any).HTMLElement) {
  (window as any).HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Simple fetch mock for UI tests (service tests using node can replace this)
if (!(global as any).fetch) {
  (global as any).fetch = vi.fn();
}

// Cleanup between tests: clear mocks only (don't restore to avoid removing global mocks)
afterEach(() => {
  vi.clearAllMocks();
});

// --- Mocks for UI Dependencies (Radix etc.) ---
// These prevent "Failed to resolve import" errors for Radix UI components
vi.mock("@radix-ui/react-label", () => ({
  Root: (props: any) => React.createElement("label", props, props.children),
}));

vi.mock("@radix-ui/react-separator", () => ({
  Root: (props: any) =>
    React.createElement("div", { ...props, role: "separator" }),
}));

vi.mock("@radix-ui/react-switch", () => ({
  Root: (props: any) =>
    React.createElement("button", { ...props, role: "switch" }),
  Thumb: (props: any) => React.createElement("span", props),
}));

vi.mock("@radix-ui/react-slot", () => ({
  Slot: (props: any) => {
    const { children, ...rest } = props;
    // Clone the child and pass props to it to simulate Slot behavior
    return React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement, rest)
      : React.createElement("div", props, children);
  },
}));
// ---------------------------------

// Mock console methods to reduce noise (keep original behavior by default)
global.console = {
  ...console,
  // Uncomment to ignore specific log levels
  // log: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

// Setup global test utilities
(global as any).testUtils = {
  // Add any test utilities here
};
