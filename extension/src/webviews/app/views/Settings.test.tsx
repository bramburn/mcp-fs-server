import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Settings from "./Settings";
import { IpcProvider, type HostIpc } from "../contexts/ipc";
import { useAppStore } from "../store";

// Mock Protocol
import {
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  TEST_CONFIG_METHOD,
  START_INDEX_METHOD,
  type QdrantOllamaConfig,
} from "../../protocol";

// Mock Store
vi.mock("../store", async () => {
  const actual = await vi.importActual<typeof import("../store")>("../store");
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

// Helper to create mock IPC
type MockHostIpc = HostIpc & {
  sendCommand: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
};

function createMockIpc(): MockHostIpc {
  return {
    sendCommand: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(null),
    onNotification: vi.fn(),
  } as unknown as MockHostIpc;
}

function renderWithIpc(
  ui: React.ReactElement,
  ipc: MockHostIpc = createMockIpc()
) {
  return {
    ipc,
    ...render(<IpcProvider value={ipc}>{ui}</IpcProvider>),
  };
}

describe("Settings View (React)", () => {
  const mockConfig: QdrantOllamaConfig = {
    index_info: { name: "test-index" },
    qdrant_config: { url: "http://localhost:6333", api_key: "old-key" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: any) =>
        selector({
          config: undefined,
          setConfig: vi.fn(),
          indexStatus: "ready",
          setView: vi.fn(),
        })
    );
  });

  it("renders form with default values when no config exists", () => {
    renderWithIpc(<Settings />);

    expect(
      screen.getByPlaceholderText("http://localhost:6333")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("nomic-embed-text")
    ).toBeInTheDocument();
    expect(screen.getByText("Save & Create")).toBeInTheDocument();
  });

  it("pre-fills form when config loads", async () => {
    const ipc = createMockIpc();
    ipc.sendRequest.mockResolvedValueOnce(mockConfig); // Mock LOAD_CONFIG response

    renderWithIpc(<Settings />, ipc);

    await waitFor(() => {
      const input = screen.getByDisplayValue("test-index");
      expect(input).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("old-key")).toBeInTheDocument();
  });

  it('sends TEST_CONFIG_METHOD when "Test Connection" is clicked', async () => {
    const ipc = createMockIpc();
    ipc.sendRequest.mockImplementation((method) => {
      if (method === LOAD_CONFIG_METHOD) return Promise.resolve(mockConfig);
      if (method === TEST_CONFIG_METHOD)
        return Promise.resolve({ success: true, message: "OK" });
      return Promise.resolve(null);
    });

    renderWithIpc(<Settings />, ipc);

    // Wait for load
    await waitFor(() => screen.getByDisplayValue("test-index"));

    const testBtn = screen.getByText("Test Connection");
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(ipc.sendRequest).toHaveBeenCalledWith(
        TEST_CONFIG_METHOD,
        "webview-mgmt",
        expect.objectContaining({
          config: expect.objectContaining({
            index_info: { name: "test-index" },
          }),
        })
      );
    });

    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it('sends SAVE_CONFIG_METHOD with updated data when "Save" is clicked', async () => {
    const ipc = createMockIpc();
    ipc.sendRequest.mockResolvedValue(mockConfig); // Default load

    renderWithIpc(<Settings />, ipc);

    // Wait for load
    await waitFor(() => screen.getByDisplayValue("test-index"));

    // Change Index Name
    const nameInput = screen.getByDisplayValue("test-index");
    fireEvent.change(nameInput, { target: { value: "new-production-index" } });

    // Click Save
    const saveBtn = screen.getByText("Save & Create");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(ipc.sendRequest).toHaveBeenCalledWith(
        SAVE_CONFIG_METHOD,
        "webview-mgmt",
        expect.objectContaining({
          config: expect.objectContaining({
            index_info: { name: "new-production-index" },
          }),
        })
      );
    });
  });

  it("triggers Force Re-Index when button is clicked", async () => {
    const ipc = createMockIpc();
    renderWithIpc(<Settings />, ipc);

    const reindexBtn = screen.getByText("Force Re-Index Workspace");
    fireEvent.click(reindexBtn);

    expect(ipc.sendCommand).toHaveBeenCalledWith(
      START_INDEX_METHOD,
      "qdrantIndex",
      {}
    );
  });
});