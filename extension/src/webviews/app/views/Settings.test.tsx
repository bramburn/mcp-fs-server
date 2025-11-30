/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  START_INDEX_METHOD,
  type QdrantOllamaConfig,
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

function createMockConfig(
  overrides?: Partial<QdrantOllamaConfig>
): QdrantOllamaConfig {
  return {
    active_vector_db: "qdrant",
    active_embedding_provider: "ollama",
    index_info: {
      name: "test-index",
      embedding_dimension: 768,
    },
    qdrant_config: {
      url: "http://localhost:6333",
      api_key: "test-key",
    },
    pinecone_config: {
      index_name: "",
      api_key: "",
    },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
    openai_config: {
      api_key: "",
      model: "text-embedding-3-small",
    },
    gemini_config: {
      api_key: "",
      model: "text-embedding-004",
    },
    ...overrides,
  };
}

function setupMockStore(storeState?: {
  config?: QdrantOllamaConfig | undefined;
  setConfig?: ReturnType<typeof vi.fn>;
  indexStatus?: "ready" | "indexing" | "error" | "no_workspace";
  setView?: ReturnType<typeof vi.fn>;
}) {
  const defaultState = {
    config: undefined,
    setConfig: vi.fn(),
    indexStatus: "ready" as const,
    setView: vi.fn(),
    ...storeState,
  };

  (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: any) => selector(defaultState)
  );

  return defaultState;
}

describe("Settings View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockStore();
  });

  describe("Initial Rendering", () => {
    it("renders the settings header with back button", () => {
      renderWithIpc(<Settings />);

      expect(screen.getByText("Settings")).toBeInTheDocument();
      const backButton = screen.getByRole("button", { name: "Back" });
      expect(backButton).toBeInTheDocument();
    });

    it("renders all main sections", () => {
      renderWithIpc(<Settings />);

      expect(screen.getByText("Index Settings")).toBeInTheDocument();
      expect(screen.getByText("Vector Database")).toBeInTheDocument();
      expect(screen.getByText("Embedding Provider")).toBeInTheDocument();
      expect(screen.getByText("Configuration Storage")).toBeInTheDocument();
    });

    it("renders default form values when no config exists", () => {
      renderWithIpc(<Settings />);

      const indexNameInput = screen.getByLabelText("Index Name");
      expect(indexNameInput).toHaveValue("");

      expect(
        screen.getByPlaceholderText("http://localhost:6333")
      ).toBeInTheDocument();

      expect(
        screen.getByPlaceholderText("nomic-embed-text")
      ).toBeInTheDocument();
    });

    it("renders action buttons", () => {
      renderWithIpc(<Settings />);

      expect(screen.getByText("Test Connection")).toBeInTheDocument();
      expect(screen.getByText("Save & Create")).toBeInTheDocument();
      expect(screen.getByText("Force Re-Index")).toBeInTheDocument();
    });
  });

  describe("Configuration Loading", () => {
    it("populates form fields with loaded configuration", async () => {
      const mockConfig = createMockConfig({
        index_info: { name: "my-custom-index", embedding_dimension: 1024 },
        qdrant_config: { url: "http://custom:6333", api_key: "secret" },
      });

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) {
            return Promise.resolve(mockConfig);
          }
          return Promise.resolve(null);
        }),
      });

      setupMockStore({ config: undefined });

      renderWithIpc(<Settings />, ipc);

      await waitFor(() => {
        expect(screen.getByDisplayValue("my-custom-index")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(
          screen.getByDisplayValue("http://custom:6333")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("calls setView when back button is clicked", () => {
      const mockSetView = vi.fn();
      setupMockStore({ setView: mockSetView });

      renderWithIpc(<Settings />);

      const backButton = screen.getByRole("button", { name: "Back" });
      fireEvent.click(backButton);

      expect(mockSetView).toHaveBeenCalledWith("search");
    });
  });

  describe("Configuration Storage Toggle", () => {
    it("renders storage toggle with default workspace storage", () => {
      renderWithIpc(<Settings />);

      expect(screen.getByText("Configuration Storage")).toBeInTheDocument();
      expect(
        screen.getByText(/Settings saved to \.qdrant\/ in this workspace/)
      ).toBeInTheDocument();
    });

    it("toggles to global storage when switch is clicked", async () => {
      renderWithIpc(<Settings />);

      // There are multiple switches, find the one associated with storage
      // The label text is inside the card content div next to the switch
      // We can find by finding the closest card container or by label if possible
      // Or simply grab all switches and pick the last one (since it's at the bottom)
      const switches = screen.getAllByRole("switch");
      const storageSwitch = switches[switches.length - 1];
      
      fireEvent.click(storageSwitch);

      await waitFor(() => {
        expect(
          screen.getByText(/Settings saved to User Profile/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Save Configuration", () => {
    it("sends save request when Save & Create button is clicked", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(undefined),
      });

      renderWithIpc(<Settings />, ipc);

      const saveButton = screen.getByText("Save & Create");
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          SAVE_CONFIG_METHOD,
          "webview-mgmt",
          expect.objectContaining({
            config: expect.any(Object),
            useGlobal: false,
          })
        );
      });
    });

    it("includes useGlobal flag when global storage is selected", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(undefined),
      });

      renderWithIpc(<Settings />, ipc);

      const switches = screen.getAllByRole("switch");
      const storageSwitch = switches[switches.length - 1];
      fireEvent.click(storageSwitch);

      const saveButton = screen.getByText("Save & Create");
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          SAVE_CONFIG_METHOD,
          "webview-mgmt",
          expect.objectContaining({
            config: expect.any(Object),
            useGlobal: true,
          })
        );
      });
    });

    it("shows Save button in header when form is dirty", async () => {
      renderWithIpc(<Settings />);

      // Initially no save button in header (header only has "Back")
      // We can check this by looking for the "Save" text which should only exist in the footer button "Save & Create"
      // or by checking button counts.
      
      // Modify form to make it dirty
      const indexNameInput = screen.getByLabelText("Index Name");
      fireEvent.change(indexNameInput, { target: { value: "modified" } });

      // Now save button should appear in header. There is already a "Save & Create" button.
      // The header button just says "Save" (based on icon or small text, but the test looks for text "Save")
      await waitFor(() => {
        // We expect to find the "Save" button in header + "Save & Create" in footer
        // Or strictly "Save" if the button text is exactly "Save"
        const saveButtons = screen.getAllByRole("button").filter(b => b.textContent === "Save");
        expect(saveButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Force Re-Index", () => {
    it("sends start index command when Force Re-Index button is clicked", () => {
      const ipc = createMockIpc();

      renderWithIpc(<Settings />, ipc);

      const reindexButton = screen.getByText("Force Re-Index");
      fireEvent.click(reindexButton);

      expect(ipc.sendCommand).toHaveBeenCalledWith(
        START_INDEX_METHOD,
        "qdrantIndex",
        {}
      );
    });
  });
});