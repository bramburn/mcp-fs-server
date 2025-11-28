/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COPY_RESULTS_METHOD,
  SEARCH_METHOD,
  START_INDEX_METHOD,
  type SearchRequestParams,
  type SearchResponseParams,
} from "../../protocol";
import { IpcProvider, type HostIpc } from "../contexts/ipc";
import { useAppStore } from "../store";
import Search from "./Search";

type ViMockFn = ReturnType<typeof vi.fn>;

vi.mock("../store", async () => {
  const actual = await vi.importActual<typeof import("../store")>("../store");
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

// Mock the SnippetList component
vi.mock("../components/SnippetList", () => ({
  default: ({ results }: { results: any[] }) => (
    <div data-testid="snippet-list">
      {results.map((result, index) => (
        <div key={index} data-testid="snippet-item">
          <div data-testid="file-path">{result.filePath}</div>
          <div data-testid="score">{result.score}</div>
        </div>
      ))}
    </div>
  )
}));

// Mock UI components with simpler testable versions
vi.mock("../components/ui/command", async () => {
  const React = await import("react");

  function Command({ children, filter }: { children: React.ReactNode; filter?: any }) {
    return <div data-testid="command">{children}</div>;
  }

  function CommandInput(props: {
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
  }) {
    return (
      <input
        data-testid="command-input"
        placeholder={props.placeholder}
        value={props.value || ""}
        onChange={(e) => props.onValueChange?.(e.target.value)}
        onKeyDown={props.onKeyDown}
      />
    );
  }

  function CommandList(props: { children?: React.ReactNode }) {
    return <div data-testid="command-list">{props.children}</div>;
  }

  function CommandEmpty(props: { children?: React.ReactNode }) {
    return <div data-testid="command-empty">{props.children}</div>;
  }

  function CommandLoading() {
    return <div data-testid="command-loading">Loading...</div>;
  }

  return {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandLoading,
  };
});

vi.mock("../components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button
      data-testid="button"
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}));

vi.mock("../components/ui/label", () => ({
  Label: ({ children, ...props }: any) => (
    <label data-testid="label" {...props}>{children}</label>
  )
}));

function renderWithIpc(
  ui: React.ReactElement,
  ipcOverrides: Partial<HostIpc> = {}
) {
  const baseIpc: HostIpc = {
    sendCommand: vi.fn() as HostIpc["sendCommand"],
    sendRequest: vi.fn() as HostIpc["sendRequest"],
    onNotification: vi.fn() as HostIpc["onNotification"],
  };

  const ipc: HostIpc = {
    ...baseIpc,
    ...ipcOverrides,
  };

  return {
    ipc,
    ...render(<IpcProvider value={ipc}>{ui}</IpcProvider>),
  };
}

describe("Search view (React)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const useAppStoreMock = useAppStore as unknown as ViMockFn;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        indexStatus: "ready",
        indexStats: { vectorCount: 100 },
        setView: vi.fn(),
      })
    );
  });

  it("renders initial UI with settings panel", () => {
    renderWithIpc(<Search />);

    expect(screen.getByText("Semantic Search")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Search Settings")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument(); // Max results
    expect(screen.getByDisplayValue("0.40")).toBeInTheDocument(); // Score threshold
    expect(
      screen.getByPlaceholderText("Search codebase...")
    ).toBeInTheDocument();
  });

  it("does not auto-search while typing", () => {
    const sendRequest = vi.fn();

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test query" } });

    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("searches when pressing Enter", async () => {
    const sendRequest = vi.fn().mockResolvedValue({ results: [] });

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        SEARCH_METHOD,
        "qdrantIndex",
        { query: "test query", limit: 50 }
      );
    });
  });

  it("filters results by score threshold", async () => {
    const mockResults = [
      { uri: "file1.ts", filePath: "file1.ts", snippet: "code", lineStart: 1, lineEnd: 2, score: 0.8 },
      { uri: "file2.ts", filePath: "file2.ts", snippet: "code", lineStart: 1, lineEnd: 2, score: 0.3 },
    ];

    const sendRequest = vi.fn().mockResolvedValue({ results: mockResults });

    renderWithIpc(<Search />, { sendRequest });

    // Set threshold to 0.5
    const thresholdSlider = screen.getByDisplayValue("0.40");
    fireEvent.change(thresholdSlider, { target: { value: "0.5" } });

    // Execute search
    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("snippet-list")).toBeInTheDocument();
      expect(screen.getAllByTestId("snippet-item")).toHaveLength(1);
      expect(screen.getByText("file1.ts")).toBeInTheDocument();
      expect(screen.queryByText("file2.ts")).not.toBeInTheDocument();
    });
  });

  it("resets settings when reset button is clicked", () => {
    renderWithIpc(<Search />);

    // Change settings
    const maxResultsSlider = screen.getByDisplayValue("50");
    fireEvent.change(maxResultsSlider, { target: { value: "75" } });

    const thresholdSlider = screen.getByDisplayValue("0.40");
    fireEvent.change(thresholdSlider, { target: { value: "0.6" } });

    // Reset
    const resetButton = screen.getByText("Reset");
    fireEvent.click(resetButton);

    expect(maxResultsSlider).toHaveValue("50");
    expect(thresholdSlider).toHaveValue("0.4");
  });

  it("shows loading state during search", async () => {
    // Create a promise that we can control
    let resolvePromise: (value: any) => void;
    const controlledPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const sendRequest = vi.fn().mockReturnValue(controlledPromise);

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Should show loading state
    expect(screen.getByTestId("command-loading")).toBeInTheDocument();

    // Resolve the promise
    resolvePromise!({ results: [] });

    // Loading should be gone
    await waitFor(() => {
      expect(screen.queryByTestId("command-loading")).not.toBeInTheDocument();
    });
  });

  it("displays search results correctly", async () => {
    const mockResults = [
      { uri: "file1.ts", filePath: "src/file1.ts", snippet: "function test()", lineStart: 10, lineEnd: 15, score: 0.9 },
      { uri: "file2.ts", filePath: "src/file2.ts", snippet: "class Example", lineStart: 1, lineEnd: 5, score: 0.7 },
    ];

    const sendRequest = vi.fn().mockResolvedValue({ results: mockResults });

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("snippet-list")).toBeInTheDocument();
      expect(screen.getAllByTestId("snippet-item")).toHaveLength(2);
      expect(screen.getByText("src/file1.ts")).toBeInTheDocument();
      expect(screen.getByText("src/file2.ts")).toBeInTheDocument();
    });
  });

  it("copies context when copy button is clicked", async () => {
    const mockResults = [
      { uri: "file1.ts", filePath: "file1.ts", snippet: "code", lineStart: 1, lineEnd: 2, score: 0.8 },
    ];

    const sendRequest = vi.fn().mockResolvedValue({ results: mockResults });
    const sendCommand = vi.fn();

    renderWithIpc(<Search />, { sendRequest, sendCommand });

    // Search first to get results
    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("snippet-list")).toBeInTheDocument();
    });

    // Click copy button
    const copyButton = screen.getByText("Copy Context");
    fireEvent.click(copyButton);

    expect(sendCommand).toHaveBeenCalledWith(
      COPY_RESULTS_METHOD,
      "qdrantIndex",
      {
        mode: "files",
        results: mockResults
      }
    );
  });

  it("does not send search for short queries (length <= 2)", () => {
    const sendRequest = vi.fn();

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText("Search codebase...");
    fireEvent.change(input, { target: { value: "te" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("triggers START_INDEX_METHOD when Re-Index is clicked", async () => {
    const sendCommand = vi.fn();

    renderWithIpc(<Search />, { sendCommand });

    const button = await screen.findByText("Re-Index");
    await fireEvent.click(button);

    expect(sendCommand).toHaveBeenCalledWith(
      START_INDEX_METHOD,
      "qdrantIndex",
      {}
    );
  });

  it("shows empty state text initially", () => {
    renderWithIpc(<Search />);

    expect(screen.getByText("Start typing to search...")).toBeInTheDocument();
  });

  it("renders No Workspace empty state when status is no_workspace", () => {
    // Override store for this specific test
    const useAppStoreMock = useAppStore as unknown as ReturnType<typeof vi.fn>;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        indexStatus: "no_workspace",
        setView: vi.fn(),
      })
    );

    renderWithIpc(<Search />);

    expect(screen.getByText("No Workspace Open")).toBeInTheDocument();
    expect(screen.getByTestId("icon-folder-open")).toBeInTheDocument();

    // Ensure search bar is NOT present
    expect(
      screen.queryByPlaceholderText("Search codebase...")
    ).not.toBeInTheDocument();
  });
});
