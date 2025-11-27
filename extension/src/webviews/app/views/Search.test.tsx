/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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

// Simplify Command behavior in tests so we can control the input value
vi.mock("../components/ui/command", async () => {
  const React = await import("react");

  const CommandContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  } | null>(null);

  function Command(props: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) {
    const { value, onValueChange, children } = props;
    return (
      <CommandContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </CommandContext.Provider>
    );
  }

  function CommandInput(props: { placeholder?: string }) {
    const ctx = React.useContext(CommandContext);
    return (
      <input
        placeholder={props.placeholder}
        value={ctx?.value ?? ""}
        onChange={(e) => ctx?.onValueChange(e.target.value)}
      />
    );
  }

  function CommandList(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>;
  }

  function CommandEmpty(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>;
  }

  function CommandLoading() {
    return <div>Loading...</div>;
  }

  return {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandLoading,
  };
});

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
        setView: vi.fn(),
      })
    );
  });

  it("renders initial UI", () => {
    renderWithIpc(<Search />);

    expect(screen.getByText("Semantic Search")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search codebase...")
    ).toBeInTheDocument();
  });

  it("debounces search input and sends SEARCH_METHOD request", () => {
    const sendRequest = vi.fn(
      async (method: string, scope: string, params: SearchRequestParams) => {
        expect(method).toBe(SEARCH_METHOD);
        expect(scope).toBe("qdrantIndex");
        expect(params.query).toBe("test");
        const response: SearchResponseParams = { results: [] };
        return response;
      }
    );

    // Make debounce run immediately by mocking setTimeout
    const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(((
      fn: (...args: any[]) => void
    ) => {
      fn();
      // Return value is never used in component code
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as any);

    renderWithIpc(<Search />, {
      sendRequest: sendRequest as HostIpc["sendRequest"],
    });

    const input = screen.getByPlaceholderText(
      "Search codebase..."
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "test" } });

    expect(sendRequest).toHaveBeenCalledTimes(1);
    const [method, scope, params] = sendRequest.mock.calls[0];
    expect(method).toBe(SEARCH_METHOD);
    expect(scope).toBe("qdrantIndex");
    expect((params as SearchRequestParams).query).toBe("test");

    setTimeoutSpy.mockRestore();
  });

  it("does not send search for short queries (length <= 2)", () => {
    const sendRequest = vi.fn();

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText(
      "Search codebase..."
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "te" } });

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
