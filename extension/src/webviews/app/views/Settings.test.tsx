/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET_VSCODE_SETTINGS_METHOD,
  LOAD_CONFIG_METHOD,
  UPDATE_VSCODE_SETTINGS_METHOD,
  type QdrantOllamaConfig,
  type VSCodeSettings,
} from "../../protocol.js";
import { IpcProvider, type HostIpc } from "../contexts/ipc.js";
import { FluentWrapper } from "../providers/FluentWrapper.js";
import { useAppStore } from "../store.js";
import Settings from "./Settings.js";

// Mock Store
vi.mock("../store", async () => {
  const actual = await vi.importActual<typeof import("../store.js")>("../store");
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

// Mock window.alert since the main code uses it now (temporary due to no modal logic)
const mockWindowAlert = vi.spyOn(window, "alert").mockImplementation(() => {});

// Type for mock IPC with vi.fn methods
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
  pineconeHost: "",
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
    mockWindowAlert.mockClear();
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
        expect(
          screen.getByDisplayValue("http://localhost:6333")
        ).toBeInTheDocument();
        // Provider Selection (Radio Check)
        const qdrantRadio = screen.getByLabelText("Qdrant");
        expect(qdrantRadio).toBeChecked();
      });
    });

    it("renders Auto-Managed Dimension text when not overridden", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });

      renderWithIpc(<Settings />, ipc);

      await waitFor(() => {
        // Since mockSettings has dimension 768, and default for nomic-embed-text is 768, it should be auto-managed
        expect(
          screen.getByText(/Auto-managed by model: 768 dimensions/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Provider Selection", () => {
    it("switches config form when Vector DB provider changes", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });

      renderWithIpc(<Settings />, ipc);

      // Wait for load
      await waitFor(() => screen.getByLabelText("Qdrant"));
      const qdrantRadio = screen.getByLabelText("Qdrant");

      // Verify Qdrant is active initially
      expect(qdrantRadio).toBeChecked();
      expect(screen.getByDisplayValue("http://localhost:6333")).toBeVisible();

      // Click Pinecone
      const pineconeRadio = screen.getByLabelText("Pinecone");
      fireEvent.click(pineconeRadio);

      await waitFor(() => {
        expect(pineconeRadio).toBeChecked();
        // Should show Pinecone fields now
        expect(screen.getByText("Pinecone Index")).toBeVisible();
      });
    });
  });

  describe("Saving", () => {
    it("sends UPDATE_VSCODE_SETTINGS_METHOD on save with new values", async () => {
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
            ...mockSettings,
            indexName: "new-index",
          })
        );
      });
    });
  });

  describe("Migration", () => {
    it("loads legacy config and populates form when Import is clicked", async () => {
      const legacyConfig: QdrantOllamaConfig = {
        active_vector_db: "pinecone",
        active_embedding_provider: "openai",
        index_info: { name: "legacy-index", embedding_dimension: 1024 }, // Non-default to trigger override
        qdrant_config: { url: "http://legacy:6333", api_key: "" },
        pinecone_config: {
          index_name: "legacy-pinecone",
          environment: "",
          api_key: "key",
        },
        ollama_config: { base_url: "", model: "" },
        openai_config: {
          api_key: "legacy-key",
          model: "text-embedding-3-large",
        },
        gemini_config: { api_key: "", model: "" },
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === GET_VSCODE_SETTINGS_METHOD)
            return Promise.resolve(mockSettings);
          if (method === LOAD_CONFIG_METHOD)
            return Promise.resolve(legacyConfig);
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      const importBtn = screen.getByText("Import from .qdrant/json");
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          LOAD_CONFIG_METHOD,
          "webview-mgmt",
          expect.any(Object)
        );

        // Verify UI updated to reflect legacy config
        expect(screen.getByLabelText("Pinecone")).toBeChecked();
        expect(screen.getByLabelText("OpenAI (Cloud)")).toBeChecked();
        expect(screen.getByDisplayValue("legacy-index")).toBeVisible();
        expect(screen.getByText("legacy-pinecone")).toBeVisible();

        // Check if dimension override checkbox is checked (1024 != 3072 default for 3-large)
        expect(
          screen.getByLabelText("Manual Dimension Override")
        ).toBeChecked();

        // Check alert was shown
        expect(mockWindowAlert).toHaveBeenCalledWith(
          "Legacy configuration loaded into form. Press 'Save All' to apply settings."
        );
      });
    });

    it("shows alert if legacy file is not found", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === GET_VSCODE_SETTINGS_METHOD)
            return Promise.resolve(mockSettings);
          if (method === LOAD_CONFIG_METHOD) return Promise.resolve(null); // Explicitly return null/undefined for file not found
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      await waitFor(() => screen.getByLabelText("Qdrant"));
      const importBtn = screen.getByText("Import from .qdrant/json");
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(mockWindowAlert).toHaveBeenCalledWith(
          "No legacy .qdrant/configuration.json file found to import."
        );
      });
    });
  });

  describe("Manual Dimension Override", () => {
    it("enables and uses manual input when checkbox is checked", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockSettings),
      });
      renderWithIpc(<Settings />, ipc);

      await waitFor(() => screen.getByLabelText("Index Name"));

      const overrideCheckbox = screen.getByLabelText(
        "Manual Dimension Override"
      ) as HTMLInputElement;
      fireEvent.click(overrideCheckbox);

      // Input has the current dimension as its value, check placeholder text instead (which is currently 768, the auto-managed value)
      const dimensionInput = screen.getByPlaceholderText(
        "768"
      ) as HTMLInputElement;
      expect(dimensionInput).toBeEnabled();

      fireEvent.change(dimensionInput, { target: { value: "512" } });

      // Save and check if the overridden value is sent
      fireEvent.click(screen.getByText("Save All Settings"));

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          UPDATE_VSCODE_SETTINGS_METHOD,
          "webview-mgmt",
          expect.objectContaining({
            embeddingDimension: 512,
            // Check other values are preserved (e.g., activeVectorDb is qdrant)
            activeVectorDb: "qdrant",
          })
        );
      });
    });
  });
});
