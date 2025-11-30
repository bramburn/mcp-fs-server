/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET_VSCODE_SETTINGS_METHOD,
  LOAD_CONFIG_METHOD,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  UPDATE_VSCODE_SETTINGS_METHOD,
  type VSCodeSettings,
} from "../../protocol";
import { IpcProvider, type HostIpc } from "../contexts/ipc";
import { FluentWrapper } from "../providers/FluentWrapper";
import { useAppStore } from "../store";
import Settings from "./Settings";

// Mock Store
vi.mock("../store", async () => {
  const actual = await vi.importActual<typeof import("../store")>("../store");
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

type MockHostIpc = HostIpc & {
  sendCommand: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
};

function createMockIpc(overrides?: Partial<MockHostIpc>): MockHostIpc {
  return {
    sendCommand: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(null),
    onNotification: vi.fn(),
    ...overrides,
  } as unknown as MockHostIpc;
}

function renderWithIpc(
  ui: React.ReactElement,
  ipc: MockHostIpc = createMockIpc()
) {
  return {
    ipc,
    ...render(
      <FluentWrapper>
        <IpcProvider value={ipc}>{ui}</IpcProvider>
      </FluentWrapper>
    ),
  };
}

const mockSettings: VSCodeSettings = {
  activeVectorDb: "qdrant",
  qdrantUrl: "http://localhost:6333",
  qdrantApiKey: "test-key",
  pineconeIndexName: "",
  pineconeEnvironment: "",
  pineconeApiKey: "",
  activeEmbeddingProvider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "nomic-embed-text",
  openaiApiKey: "",
  openaiModel: "text-embedding-3-small",
  geminiApiKey: "",
  geminiModel: "text-embedding-004",
  indexName: "test-index",
  embeddingDimension: 768,
  searchLimit: 15,
  searchThreshold: 0.6,
  includeQueryInCopy: true,
};

describe("Settings View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: any) =>
        selector({
          setView: vi.fn(),
          indexStatus: "ready",
        })
    );
  });

  describe("Initial Rendering", () => {
    it("renders with VS Code settings values", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === GET_VSCODE_SETTINGS_METHOD) {
            return Promise.resolve(mockSettings);
          }
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      await waitFor(() => {
        // Inputs
        expect(screen.getByDisplayValue("test-index")).toBeInTheDocument();
        expect(screen.getByDisplayValue("http://localhost:6333")).toBeInTheDocument();
        // Provider Selection (Radio Check)
        const qdrantRadio = screen.getByLabelText("Qdrant");
        expect(qdrantRadio).toBeChecked();
      });
    });
  });

  describe("Provider Selection", () => {
    it("switches config form when Vector DB provider changes", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });

      renderWithIpc(<Settings />, ipc);

      // Verify Qdrant is active initially
      expect(screen.getByLabelText("Qdrant")).toBeChecked();
      expect(screen.getByDisplayValue("http://localhost:6333")).toBeVisible();

      // Click Pinecone
      const pineconeRadio = screen.getByLabelText("Pinecone");
      fireEvent.click(pineconeRadio);

      await waitFor(() => {
        expect(pineconeRadio).toBeChecked();
        // Should show Pinecone fields now
        expect(screen.getByLabelText("Pinecone Index Name")).toBeVisible();
      });
    });
  });

  describe("Sliders and Numbers", () => {
    it("renders Slider for Score Threshold", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });
      renderWithIpc(<Settings />, ipc);

      await waitFor(() => {
        const slider = screen.getByRole("slider");
        expect(slider).toBeInTheDocument();
        expect(slider).toHaveValue("60"); // 0.6 * 100 for slider display
      });
    });
  });

  describe("Saving", () => {
    it("sends UPDATE_VSCODE_SETTINGS_METHOD on save", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });

      renderWithIpc(<Settings />, ipc);

      // Wait for load
      await waitFor(() => screen.getByDisplayValue("test-index"));

      // Change a value to make form dirty
      const input = screen.getByDisplayValue("test-index");
      fireEvent.change(input, { target: { value: "new-index" } });

      const saveBtn = screen.getByText("Save All Settings");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          UPDATE_VSCODE_SETTINGS_METHOD,
          "webview-mgmt",
          expect.objectContaining({
            indexName: "new-index",
            activeVectorDb: "qdrant"
          })
        );
      });
    });
  });

  describe("Migration", () => {
    it("loads legacy config and populates form when Import is clicked", async () => {
      const legacyConfig = {
        active_vector_db: "pinecone",
        pinecone_config: { index_name: "legacy-pinecone" },
        // ... other fields
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === GET_VSCODE_SETTINGS_METHOD) return Promise.resolve(mockSettings);
          if (method === LOAD_CONFIG_METHOD) return Promise.resolve(legacyConfig);
          return Promise.resolve(null);
        })
      });

      renderWithIpc(<Settings />, ipc);

      const importBtn = screen.getByText("Import from .qdrant/json");
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(LOAD_CONFIG_METHOD, "webview-mgmt", expect.any(Object));
        // Verify UI updated to reflect legacy config
        expect(screen.getByLabelText("Pinecone")).toBeChecked();
        expect(screen.getByDisplayValue("legacy-pinecone")).toBeVisible();
      });
    });
  });
});