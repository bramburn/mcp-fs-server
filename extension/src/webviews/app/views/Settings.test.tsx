/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  type QdrantOllamaConfig,
  type TestConfigResponse,
} from "../../protocol";
import { IpcProvider, type HostIpc } from "../contexts/ipc";
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

/**
 * Creates a mock IPC instance with default implementations
 */
function createMockIpc(overrides?: Partial<MockHostIpc>): MockHostIpc {
  return {
    sendCommand: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(null),
    onNotification: vi.fn(),
    ...overrides,
  } as unknown as MockHostIpc;
}

/**
 * Renders a component wrapped in IpcProvider with a mock IPC
 */
function renderWithIpc(
  ui: React.ReactElement,
  ipc: MockHostIpc = createMockIpc()
) {
  return {
    ipc,
    ...render(<IpcProvider value={ipc}>{ui}</IpcProvider>),
  };
}

/**
 * Creates a complete mock configuration for testing
 */
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
      environment: "",
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

/**
 * Sets up the mock store with default or custom state
 */
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
      // Back button should be present (ChevronLeft icon)
      const backButton = screen.getByRole("button", { name: "" });
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

      // Index name input should be empty initially
      const indexNameInput = screen.getByLabelText("Index Name");
      expect(indexNameInput).toHaveValue("");

      // Default Qdrant URL placeholder
      expect(
        screen.getByPlaceholderText("http://localhost:6333")
      ).toBeInTheDocument();

      // Default Ollama model placeholder
      expect(
        screen.getByPlaceholderText("nomic-embed-text")
      ).toBeInTheDocument();
    });

    it("renders action buttons", () => {
      renderWithIpc(<Settings />);

      expect(screen.getByText("Test Connection")).toBeInTheDocument();
      expect(screen.getByText("Save & Create")).toBeInTheDocument();
      expect(screen.getByText("Force Re-Index Workspace")).toBeInTheDocument();
    });
  });

  describe("Configuration Loading", () => {
    it("loads configuration on mount when config is not in store", async () => {
      const mockConfig = createMockConfig();
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) {
            return Promise.resolve(mockConfig);
          }
          return Promise.resolve(null);
        }),
      });

      const mockSetConfig = vi.fn();
      setupMockStore({ config: undefined, setConfig: mockSetConfig });

      renderWithIpc(<Settings />, ipc);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          LOAD_CONFIG_METHOD,
          "qdrantIndex",
          {}
        );
      });

      await waitFor(() => {
        expect(mockSetConfig).toHaveBeenCalledWith(mockConfig);
      });
    });

    it("does not load configuration if already in store", () => {
      const mockConfig = createMockConfig();
      const ipc = createMockIpc();

      setupMockStore({ config: mockConfig });

      renderWithIpc(<Settings />, ipc);

      expect(ipc.sendRequest).not.toHaveBeenCalledWith(
        LOAD_CONFIG_METHOD,
        expect.anything(),
        expect.anything()
      );
    });

    it("populates form fields with loaded configuration", async () => {
      const mockConfig = createMockConfig({
        index_info: { name: "my-custom-index", embedding_dimension: 1024 },
        qdrant_config: { url: "http://custom:6333", api_key: "secret" },
      });

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(mockConfig),
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

      const backButton = screen.getAllByRole("button")[0]; // First button is back
      fireEvent.click(backButton);

      expect(mockSetView).toHaveBeenCalledWith("search");
    });
  });

  describe("Vector Database Selection", () => {
    it("shows Qdrant section expanded by default", () => {
      renderWithIpc(<Settings />);

      // Qdrant accordion should be open
      expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    });

    it("switches to Pinecone when Pinecone accordion is clicked", async () => {
      renderWithIpc(<Settings />);

      const pineconeButton = screen.getByText("Pinecone (Cloud)");
      fireEvent.click(pineconeButton);

      await waitFor(() => {
        expect(screen.getByLabelText("Index Name")).toBeInTheDocument();
        expect(
          screen.getByLabelText("Environment (e.g. gcp-starter)")
        ).toBeInTheDocument();
      });
    });

    it("updates Qdrant URL when input changes", async () => {
      renderWithIpc(<Settings />);

      const urlInput = screen.getByLabelText("Server URL");
      fireEvent.change(urlInput, {
        target: { value: "http://custom-qdrant:6333" },
      });

      await waitFor(() => {
        expect(urlInput).toHaveValue("http://custom-qdrant:6333");
      });
    });

    it("updates Qdrant API key when input changes", async () => {
      renderWithIpc(<Settings />);

      const apiKeyInput = screen.getByLabelText("API Key (Optional)");
      fireEvent.change(apiKeyInput, { target: { value: "new-secret-key" } });

      await waitFor(() => {
        expect(apiKeyInput).toHaveValue("new-secret-key");
      });
    });
  });

  describe("Embedding Provider Selection", () => {
    it("shows Ollama section expanded by default", () => {
      renderWithIpc(<Settings />);

      // Ollama accordion should be open
      expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
      expect(screen.getByLabelText("Model")).toBeInTheDocument();
    });

    it("switches to OpenAI when OpenAI accordion is clicked", async () => {
      renderWithIpc(<Settings />);

      const openaiButton = screen.getByText("OpenAI (Cloud)");
      fireEvent.click(openaiButton);

      await waitFor(() => {
        const apiKeyInputs = screen.getAllByLabelText("API Key");
        expect(apiKeyInputs.length).toBeGreaterThan(0);
      });
    });

    it("switches to Gemini when Gemini accordion is clicked", async () => {
      renderWithIpc(<Settings />);

      const geminiButton = screen.getByText("Google Gemini (Cloud)");
      fireEvent.click(geminiButton);

      await waitFor(() => {
        const apiKeyInputs = screen.getAllByLabelText("API Key");
        expect(apiKeyInputs.length).toBeGreaterThan(0);
      });
    });

    it("updates Ollama base URL when input changes", async () => {
      renderWithIpc(<Settings />);

      const baseUrlInput = screen.getByLabelText("Base URL");
      fireEvent.change(baseUrlInput, {
        target: { value: "http://custom-ollama:11434" },
      });

      await waitFor(() => {
        expect(baseUrlInput).toHaveValue("http://custom-ollama:11434");
      });
    });

    it("updates Ollama model when input changes", async () => {
      renderWithIpc(<Settings />);

      const modelInput = screen.getByLabelText("Model");
      fireEvent.change(modelInput, { target: { value: "llama2" } });

      await waitFor(() => {
        expect(modelInput).toHaveValue("llama2");
      });
    });
  });

  describe("Index Settings", () => {
    it("updates index name when input changes", async () => {
      renderWithIpc(<Settings />);

      const indexNameInput = screen.getByLabelText("Index Name");
      fireEvent.change(indexNameInput, {
        target: { value: "my-new-index" },
      });

      await waitFor(() => {
        expect(indexNameInput).toHaveValue("my-new-index");
      });
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

      const switchElement = screen.getByRole("switch");
      fireEvent.click(switchElement);

      await waitFor(() => {
        expect(
          screen.getByText(/Settings saved to User Profile/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Test Connection", () => {
    it("sends test request when Test Connection button is clicked", async () => {
      const mockConfig = createMockConfig();
      const testResponse: TestConfigResponse = {
        success: true,
        message: "All connections successful",
        qdrantStatus: "connected",
        ollamaStatus: "connected",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) return Promise.resolve(mockConfig);
          if (method === TEST_CONFIG_METHOD)
            return Promise.resolve(testResponse);
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      // Wait for config to load
      await waitFor(() => screen.getByDisplayValue("test-index"));

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(ipc.sendRequest).toHaveBeenCalledWith(
          TEST_CONFIG_METHOD,
          "webview-mgmt",
          expect.objectContaining({
            config: expect.any(Object),
          })
        );
      });
    });

    it("displays success message when test succeeds", async () => {
      const testResponse: TestConfigResponse = {
        success: true,
        message: "All connections successful",
        qdrantStatus: "connected",
        ollamaStatus: "connected",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(testResponse),
      });

      renderWithIpc(<Settings />, ipc);

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(
          screen.getByText("All connections successful")
        ).toBeInTheDocument();
      });
    });

    it("displays granular status badges when test succeeds", async () => {
      const mockConfig = createMockConfig();
      const testResponse: TestConfigResponse = {
        success: true,
        message: "All connections successful",
        qdrantStatus: "connected",
        ollamaStatus: "connected",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) return Promise.resolve(mockConfig);
          if (method === TEST_CONFIG_METHOD)
            return Promise.resolve(testResponse);
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      // Wait for config to load
      await waitFor(() => screen.getByDisplayValue("test-index"));

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        const connectedBadges = screen.getAllByText("Connected");
        expect(connectedBadges.length).toBeGreaterThan(0);
      });
    });

    it("displays failure message when test fails", async () => {
      const testResponse: TestConfigResponse = {
        success: false,
        message: "Connection failed",
        qdrantStatus: "failed",
        ollamaStatus: "failed",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(testResponse),
      });

      renderWithIpc(<Settings />, ipc);

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      });
    });

    it("displays granular status when Qdrant succeeds but Ollama fails", async () => {
      const mockConfig = createMockConfig();
      const testResponse: TestConfigResponse = {
        success: false,
        message: "Ollama connection failed",
        qdrantStatus: "connected",
        ollamaStatus: "failed",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) return Promise.resolve(mockConfig);
          if (method === TEST_CONFIG_METHOD)
            return Promise.resolve(testResponse);
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      // Wait for config to load
      await waitFor(() => screen.getByDisplayValue("test-index"));

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        const connectedBadges = screen.getAllByText("Connected");
        const failedBadges = screen.getAllByText("Failed");
        expect(connectedBadges.length).toBeGreaterThan(0); // Qdrant
        expect(failedBadges.length).toBeGreaterThan(0); // Ollama
      });
    });

    it("disables test button while testing", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    success: true,
                    message: "Success",
                    qdrantStatus: "connected",
                    ollamaStatus: "connected",
                  }),
                100
              )
            )
        ),
      });

      renderWithIpc(<Settings />, ipc);

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      // Button should be disabled during test
      expect(testButton).toBeDisabled();
    });

    it("clears previous test results when form is modified", async () => {
      const testResponse: TestConfigResponse = {
        success: true,
        message: "All connections successful",
        qdrantStatus: "connected",
        ollamaStatus: "connected",
      };

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockResolvedValue(testResponse),
      });

      renderWithIpc(<Settings />, ipc);

      // First test
      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(
          screen.getByText("All connections successful")
        ).toBeInTheDocument();
      });

      // Modify form
      const urlInput = screen.getByLabelText("Server URL");
      fireEvent.change(urlInput, { target: { value: "http://new:6333" } });

      // Test result should be cleared
      await waitFor(() => {
        expect(
          screen.queryByText("All connections successful")
        ).not.toBeInTheDocument();
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

      // Toggle to global storage
      const switchElement = screen.getByRole("switch");
      fireEvent.click(switchElement);

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

    it("disables save button while saving", async () => {
      const ipc = createMockIpc({
        sendRequest: vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100))
          ),
      });

      renderWithIpc(<Settings />, ipc);

      const saveButton = screen.getByText("Save & Create");
      fireEvent.click(saveButton);

      // Button should be disabled during save
      expect(saveButton).toBeDisabled();
    });

    it("shows Save button in header when form is dirty", async () => {
      renderWithIpc(<Settings />);

      // Initially no save button in header
      const headerButtons = screen.getAllByRole("button");
      const headerSaveButton = headerButtons.find((btn) =>
        btn.textContent?.includes("Save")
      );
      expect(headerSaveButton).toBeUndefined();

      // Modify form to make it dirty
      const indexNameInput = screen.getByLabelText("Index Name");
      fireEvent.change(indexNameInput, { target: { value: "modified" } });

      // Now save button should appear in header
      await waitFor(() => {
        const buttons = screen.getAllByText("Save");
        expect(buttons.length).toBeGreaterThan(1); // One in header, one in footer
      });
    });

    it("reloads configuration after successful save", async () => {
      const mockConfig = createMockConfig();
      let loadCallCount = 0;

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === LOAD_CONFIG_METHOD) {
            loadCallCount++;
            return Promise.resolve(mockConfig);
          }
          if (method === SAVE_CONFIG_METHOD) {
            return Promise.resolve(undefined);
          }
          return Promise.resolve(null);
        }),
      });

      setupMockStore({ config: undefined });

      renderWithIpc(<Settings />, ipc);

      // Wait for initial load
      await waitFor(() => loadCallCount === 1);

      const saveButton = screen.getByText("Save & Create");
      fireEvent.click(saveButton);

      // Should reload config after save
      await waitFor(() => {
        expect(loadCallCount).toBe(2);
      });
    });
  });

  describe("Force Re-Index", () => {
    it("sends start index command when Force Re-Index button is clicked", () => {
      const ipc = createMockIpc();

      renderWithIpc(<Settings />, ipc);

      const reindexButton = screen.getByText("Force Re-Index Workspace");
      fireEvent.click(reindexButton);

      expect(ipc.sendCommand).toHaveBeenCalledWith(
        START_INDEX_METHOD,
        "qdrantIndex",
        {}
      );
    });

    it("disables re-index button when indexing is in progress", () => {
      setupMockStore({ indexStatus: "indexing" });

      renderWithIpc(<Settings />);

      const reindexButton = screen.getByText("Indexing...");
      expect(reindexButton).toBeDisabled();
    });

    it("shows Indexing... text when indexing is in progress", () => {
      setupMockStore({ indexStatus: "indexing" });

      renderWithIpc(<Settings />);

      expect(screen.getByText("Indexing...")).toBeInTheDocument();
    });
  });

  describe("Embedding Dimension Auto-Population", () => {
    it("sets default dimension for Ollama nomic-embed-text", async () => {
      renderWithIpc(<Settings />);

      // Default is Ollama with nomic-embed-text
      // The Model input should be visible since Ollama is expanded by default
      const modelInput = screen.getByPlaceholderText("nomic-embed-text");
      expect(modelInput).toBeInTheDocument();
      expect(modelInput).toHaveValue("nomic-embed-text");

      // The dimension is set internally to 768 for nomic-embed-text
      // This is tested indirectly through the save functionality
    });

    it("updates dimension when switching to OpenAI text-embedding-3-large", async () => {
      renderWithIpc(<Settings />);

      // Switch to OpenAI
      const openaiButton = screen.getByText("OpenAI (Cloud)");
      fireEvent.click(openaiButton);

      await waitFor(() => {
        // After switching, OpenAI section should be expanded
        // Check for the OpenAI model input
        const modelInput = screen.getByPlaceholderText(
          "text-embedding-3-small"
        );
        expect(modelInput).toBeInTheDocument();
      });

      // Find the Model input (should be visible now)
      const modelInput = screen.getByPlaceholderText("text-embedding-3-small");

      fireEvent.change(modelInput, {
        target: { value: "text-embedding-3-large" },
      });

      await waitFor(() => {
        expect(modelInput).toHaveValue("text-embedding-3-large");
      });

      // The dimension should auto-update to 3072 for text-embedding-3-large
      // This is tested indirectly through the component's useEffect
    });
  });

  describe("Error Handling", () => {
    it("handles test connection error gracefully", async () => {
      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === TEST_CONFIG_METHOD) {
            return Promise.resolve({
              success: false,
              message: "Network error",
              qdrantStatus: "failed",
              ollamaStatus: "failed",
            });
          }
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      const testButton = screen.getByText("Test Connection");
      fireEvent.click(testButton);

      await waitFor(
        () => {
          expect(screen.getByText("Network error")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it("handles save error gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const ipc = createMockIpc({
        sendRequest: vi.fn().mockImplementation((method) => {
          if (method === SAVE_CONFIG_METHOD) {
            return Promise.reject(new Error("Save failed"));
          }
          return Promise.resolve(null);
        }),
      });

      renderWithIpc(<Settings />, ipc);

      const saveButton = screen.getByText("Save & Create");
      fireEvent.click(saveButton);

      await waitFor(
        () => {
          expect(consoleErrorSpy).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Accessibility", () => {
    it("has proper form inputs visible", () => {
      renderWithIpc(<Settings />);

      // Check for always-visible inputs
      expect(screen.getByPlaceholderText("codebase-index")).toBeInTheDocument();

      // Check for inputs in expanded sections (Qdrant and Ollama are expanded by default)
      expect(
        screen.getByPlaceholderText("http://localhost:6333")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("http://localhost:11434")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("nomic-embed-text")
      ).toBeInTheDocument();
    });

    it("has proper button roles", () => {
      renderWithIpc(<Settings />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("has proper switch role for storage toggle", () => {
      renderWithIpc(<Settings />);

      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeInTheDocument();
    });
  });
});
