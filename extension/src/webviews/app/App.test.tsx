/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";

// App uses the Zustand store and hostIpc; we keep those real but
// spy on window message listeners to ensure they are wired correctly.

describe("App root (React)", () => {
  const addEventListenerSpy = vi.spyOn(window, "addEventListener");
  const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the Search view by default", () => {
    render(<App />);

    expect(screen.getByText("Semantic Search")).toBeInTheDocument();
  });

  it("registers and cleans up window message event listener", () => {
    const { unmount } = render(<App />);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );
  });
});
