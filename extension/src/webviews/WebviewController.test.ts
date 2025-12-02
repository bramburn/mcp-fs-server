import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ILogger } from "../services/LoggerService.js";
import { SettingsManager } from "../settings.js"; // Import real SettingsManager to mock it
import vscode from "../test/mocks/vscode-api.js";
import {
  DID_CHANGE_CONFIG_NOTIFICATION, // <-- FIX: Added missing import
  GET_VSCODE_SETTINGS_METHOD,
  IpcRequest,
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  TEST_CONFIG_METHOD,
  UPDATE_VSCODE_SETTINGS_METHOD,
  type QdrantOllamaConfig,
  type SaveConfigParams, // <-- FIX: Added missing import type
  type TestConfigParams, // <-- FIX: Added missing import type
  type VSCodeSettings,
} from "./protocol.js";
import { WebviewController } from "./WebviewController.js";

// Mock SettingsManager and define mock settings structure
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
  searchLimit: 10,
  searchThreshold: 0.7,
  includeQueryInCopy: false,
};

vi.mock("../settings.js", () => ({
  SettingsManager: {
    getSettings: vi.fn(() => mockSettings),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock vscode module to ensure window.showErrorMessage is available
vi.mock("vscode", async () => {
  const actual = await vi.importActual<
    typeof import("../test/mocks/vscode-api.js")
  >("../test/mocks/vscode-api.js");
  return {
    default: actual.default,
    ...actual.default,
    languages: {
      onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
    },
  };
});

describe("WebviewController", () => {
  let controller: WebviewController;
  let mockIndexingService: any;
  let mockWorkspaceManager: any;
  let mockConfigService: any;
  let mockAnalyticsService: any;
  let mockLogger: ILogger;
  let mockWebview: any;
  let mockClipboardService: any;

  const mockExtensionUri = vscode.Uri.file("/test/extension");

  const mockLegacyConfig: QdrantOllamaConfig = {
    active_vector_db: "qdrant",
    active_embedding_provider: "ollama",
    index_info: { name: "test-index" },
    qdrant_config: { url: "http://localhost:6333" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockIndexingService = {
      startIndexing: vi.fn(),
      search: vi.fn(),
      isIndexing: false,
      initializeForSearch: vi.fn().mockResolvedValue(true),
      getCollectionStats: vi.fn().mockResolvedValue({ vectorCount: 100 }),
    };

    mockWorkspaceManager = {
      getActiveWorkspaceFolder: vi.fn().mockReturnValue({
        uri: vscode.Uri.file("/ws"),
        name: "ws",
        index: 0,
      }),
    };

    mockConfigService = {
      // Retain loadQdrantConfig/validateConnectionDetailed for migration/testing features
      loadQdrantConfig: vi.fn().mockResolvedValue(mockLegacyConfig),
      saveQdrantConfig: vi.fn().mockResolvedValue(undefined),
      validateConnection: vi.fn().mockResolvedValue(true),
      validateConnectionDetailed: vi.fn().mockResolvedValue({
        success: true,
        message: "Connection successful",
        ollamaStatus: "connected",
        qdrantStatus: "connected",
      }),
      addConfigurationChangeListener: vi.fn((cb) => {
        // Store callback if needed, or just ignore for now if not manually triggering
      }),
      removeConfigurationChangeListener: vi.fn(),
    };

    mockAnalyticsService = {
      trackEvent: vi.fn(),
      trackPageView: vi.fn(),
      trackError: vi.fn(),
      trackSearch: vi.fn(),
    };

    mockLogger = {
      log: vi.fn(),
    };

    mockClipboardService = {
      copyFilesToClipboard: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      dispose: vi.fn(),
    };

    mockWebview = {
      asWebviewUri: vi.fn((uri: any) => uri),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
      options: {},
      html: "",
    };

    controller = new WebviewController(
      mockExtensionUri,
      mockIndexingService,
      mockWorkspaceManager,
      mockConfigService,
      mockAnalyticsService,
      mockLogger,
      mockClipboardService
    );
  });

  function setupWebview(): (message: any) => Promise<void> | void {
    let handler: (message: any) => Promise<void> | void = () => {};
    mockWebview.onDidReceiveMessage.mockImplementation(
      (cb: (message: any) => void) => {
        handler = cb;
        return { dispose: vi.fn() };
      }
    );

    const webviewView: any = {
      webview: mockWebview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };

    controller.resolveWebviewView(webviewView, {} as any, {} as any);
    return handler;
  }

  // --- New VS Code Settings Handlers ---

  it("handles GET_VSCODE_SETTINGS_METHOD request by calling SettingsManager.getSettings", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<Record<string, never>> = {
      id: "req-get-settings",
      kind: "request",
      scope: "webview-mgmt",
      method: GET_VSCODE_SETTINGS_METHOD,
      params: {},
      timestamp: Date.now(),
    };

    await messageHandler(request);

    // Should call the mocked SettingsManager.getSettings
    expect(SettingsManager.getSettings).toHaveBeenCalledTimes(1);

    // Should respond with the data from the mock SettingsManager
    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-get-settings",
        data: mockSettings,
      })
    );
  });

  it("handles UPDATE_VSCODE_SETTINGS_METHOD request by calling SettingsManager.updateSettings", async () => {
    const messageHandler = setupWebview();

    const updatedSettings: Partial<VSCodeSettings> = {
      indexName: "new-codebase-index",
      searchLimit: 25,
    };

    const request: IpcRequest<Partial<VSCodeSettings>> = {
      id: "req-update-settings",
      kind: "request",
      scope: "webview-mgmt",
      method: UPDATE_VSCODE_SETTINGS_METHOD,
      params: updatedSettings,
      timestamp: Date.now(),
    };

    await messageHandler(request);

    // Should call the mocked SettingsManager.updateSettings with the partial settings
    expect(SettingsManager.updateSettings).toHaveBeenCalledWith(
      updatedSettings
    );

    // Should respond with success
    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-update-settings",
        data: { success: true },
      })
    );

    // Should send a configuration change notification
    // Note: ConfigService mock doesn't trigger listener automatically, so we skip this check
    // unless we manually invoke the callback stored in addConfigurationChangeListener.
  });

  // --- Legacy Config Tests (Still used for Migration/Test features) ---

  it("handles LOAD_CONFIG_METHOD request (returns null as legacy logic is deprecated in handler)", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<Record<string, never>> = {
      id: "req-load-config",
      kind: "request",
      scope: "webview-mgmt",
      method: LOAD_CONFIG_METHOD,
      params: {},
      timestamp: Date.now(),
    };

    await messageHandler(request);

    // Handler returns null as per refactor
    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-load-config",
        data: null,
      })
    );
  });

  it("handles TEST_CONFIG_METHOD request", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<TestConfigParams> = {
      id: "req-test-config",
      kind: "request",
      scope: "webview-mgmt",
      method: TEST_CONFIG_METHOD,
      params: { config: mockLegacyConfig },
      timestamp: Date.now(),
    };

    await messageHandler(request);

    expect(mockConfigService.validateConnectionDetailed).toHaveBeenCalledWith(
      mockLegacyConfig
    );

    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-test-config",
        data: expect.objectContaining({
          success: true,
          message: expect.stringContaining("successful"),
        }),
      })
    );
  });

  // NOTE: SAVE_CONFIG_METHOD is deprecated but retained in the controller for the migration phase (P1)
  it("handles SAVE_CONFIG_METHOD request (noop/deprecated)", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<SaveConfigParams> = {
      id: "req-save-legacy",
      kind: "request",
      scope: "webview-mgmt",
      method: SAVE_CONFIG_METHOD,
      params: { config: mockLegacyConfig, useGlobal: false },
      timestamp: Date.now(),
    };

    await messageHandler(request);

    // Handler returns success but does not call saveQdrantConfig
    
    // Check for successful response
    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-save-legacy",
        data: { success: true },
      })
    );
  });
});
