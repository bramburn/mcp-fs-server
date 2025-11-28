import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ILogger } from "../services/LoggerService.js";
import vscode from "../test/mocks/vscode-api.js";
import {
  SAVE_CONFIG_METHOD,
  TEST_CONFIG_METHOD,
  type IpcRequest,
  type QdrantOllamaConfig,
} from "./protocol.js";
import { WebviewController } from "./WebviewController.js";

// Mock vscode module to ensure window.showErrorMessage is available
vi.mock("vscode", async () => {
  const actual = await vi.importActual<
    typeof import("../test/mocks/vscode-api.js")
  >("../test/mocks/vscode-api.js");
  return {
    default: actual.default,
    ...actual.default,
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

  const mockExtensionUri = vscode.Uri.file("/test/extension");

  const mockConfig: QdrantOllamaConfig = {
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
    };

    mockWorkspaceManager = {
      getActiveWorkspaceFolder: vi.fn().mockReturnValue({
        uri: vscode.Uri.file("/ws"),
        name: "ws",
        index: 0,
      }),
    };

    mockConfigService = {
      loadQdrantConfig: vi.fn(),
      saveQdrantConfig: vi.fn().mockResolvedValue(undefined),
      validateConnection: vi.fn().mockResolvedValue(true),
      validateConnectionDetailed: vi.fn().mockResolvedValue({
        success: true,
        message: "Connection successful",
        ollamaStatus: "connected",
        qdrantStatus: "connected",
      }),
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
      mockLogger
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

  it("handles SAVE_CONFIG_METHOD request", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<{ config: QdrantOllamaConfig }> = {
      id: "req-1",
      kind: "request",
      scope: "webview-mgmt",
      method: SAVE_CONFIG_METHOD,
      params: { config: mockConfig },
      timestamp: Date.now(),
    };

    await messageHandler(request);

    expect(mockConfigService.saveQdrantConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ws" }),
      mockConfig,
      false // useGlobal defaults to false
    );

    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-1",
        data: { success: true },
      })
    );
  });

  it("handles TEST_CONFIG_METHOD request", async () => {
    const messageHandler = setupWebview();

    const request: IpcRequest<{ config: QdrantOllamaConfig }> = {
      id: "req-2",
      kind: "request",
      scope: "webview-mgmt",
      method: TEST_CONFIG_METHOD,
      params: { config: mockConfig },
      timestamp: Date.now(),
    };

    await messageHandler(request);

    expect(mockConfigService.validateConnectionDetailed).toHaveBeenCalledWith(
      mockConfig
    );

    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "response",
        responseId: "req-2",
        data: expect.objectContaining({
          success: true,
          message: expect.stringContaining("successful"),
        }),
      })
    );
  });
});
