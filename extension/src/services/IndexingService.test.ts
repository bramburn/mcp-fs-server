import { QdrantClient } from "@qdrant/js-client-rest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
// ✅ FIX: Import mocked vscode instead of real vscode API
import vscode from "../test/mocks/vscode-api.js";
import { QdrantOllamaConfig } from "../webviews/protocol.js";
import { ConfigService } from "./ConfigService.js";
import { IndexingService } from "./IndexingService.js";
import { ILogger } from "./LoggerService.js";

// Mock Qdrant client
vi.mock("@qdrant/js-client-rest");

// Mock shared code splitter (must match the actual import specifier)
vi.mock("../../../packages/shared/code-splitter.js", () => ({
  CodeSplitter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    split: vi.fn().mockReturnValue([
      {
        id: "test-chunk-1",
        filePath: "test.ts",
        content: "function test() {}",
        lineStart: 1,
        lineEnd: 5,
      },
    ]),
  })),
}));

// Mock VS Code API
vi.mock("vscode", () => {
  const mockOnDidChangeConfiguration = vi.fn();
  const mockGet = vi.fn((key?: string) => {
    if (key === "qdrant.search.trace") return false;
    if (key === "qdrant.indexing.enabled") return true;
    if (key === "qdrant.indexing.maxFiles") return 500;
    if (key === "qdrant.search.limit") return 10;
    return "default";
  });

  const MockCancellationTokenSource = class {
    token: { isCancellationRequested: boolean } = {
      isCancellationRequested: false,
    };
    cancel = vi.fn(() => {
      this.token.isCancellationRequested = true;
    });
    dispose = vi.fn();
  };

  return {
    workspace: {
      fs: {
        stat: vi.fn(),
        readFile: vi.fn(),
        createDirectory: vi.fn(),
        writeFile: vi.fn(),
      },
      findFiles: vi.fn(),
      getConfiguration: () => ({ get: mockGet }),
      asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
        if (typeof pathOrUri === "string") {
          return pathOrUri.replace("/test/workspace/", "");
        }
        return pathOrUri.fsPath.replace("/test/workspace/", "");
      }),
      workspaceFolders: [
        {
          uri: { fsPath: "/test/workspace" },
          name: "test-workspace",
          index: 0,
        },
      ],
      onDidChangeConfiguration: mockOnDidChangeConfiguration,
    },
    window: {
      activeTextEditor: undefined,
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      setStatusBarMessage: vi.fn(),
    },
    Uri: {
      joinPath: vi.fn((base: any, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join("/"),
        scheme: "file",
        path: [base.fsPath, ...segments].join("/"),
        query: "",
        fragment: "",
        with: vi.fn(),
        toString: vi.fn(() => [base.fsPath, ...segments].join("/")),
      })),
      file: vi.fn((path: string) => ({
        fsPath: path,
        scheme: "file",
        path: path,
        query: "",
        fragment: "",
        with: vi.fn(),
        toString: vi.fn(() => path),
      })),
    },
    RelativePattern: vi.fn(),
    CancellationTokenSource: MockCancellationTokenSource as any,
    Disposable: class Disposable {
      dispose = vi.fn();
    },
    ConfigurationChangeEvent: class {},
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64,
    },
  };
});

global.fetch = vi.fn();

describe("IndexingService", () => {
  let indexingService: IndexingService;
  let mockConfigService: ConfigService;
  let mockContext: any;
  let mockQdrantClient: any;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: "/test/extension" },
      subscriptions: [],
    };

    mockLogger = {
      log: vi.fn(),
    };

    mockConfigService = new ConfigService(mockLogger);

    // Create mock AnalyticsService
    const mockAnalyticsService = {
      trackEvent: vi.fn(),
      trackPageView: vi.fn(),
      trackCommand: vi.fn(),
      trackIndexing: vi.fn(),
      trackSearch: vi.fn(),
      trackError: vi.fn(),
      dispose: vi.fn(),
    } as any;

    indexingService = new IndexingService(
      mockConfigService,
      mockContext,
      mockAnalyticsService,
      mockLogger
    );

    mockQdrantClient = {
      getCollections: vi.fn(),
      createCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(),
      delete: vi.fn(),
    };

    (QdrantClient as any).mockImplementation(() => mockQdrantClient);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("stopIndexing", () => {
    test("should cancel indexing when stopIndexing is called", async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: "test-index" },
        qdrant_config: { url: "http://localhost:6333" },
        ollama_config: {
          base_url: "http://localhost:11434",
          model: "nomic-embed-text",
        },
      };

      vi.spyOn(mockConfigService, "loadQdrantConfig").mockResolvedValueOnce(
        mockConfig
      );
      vi.spyOn(mockConfigService, "validateConnection").mockResolvedValueOnce(
        true
      );
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: {
          enabled: true,
          maxFiles: 500,
          excludePatterns: [],
          includeExtensions: ["ts", "js"],
        },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
      });

      mockQdrantClient.getCollections.mockResolvedValueOnce({
        collections: [],
      });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([
        vscode.Uri.file("/test/workspace/test.ts"),
      ]);

      vi.mocked(vscode.workspace.fs.readFile).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(new TextEncoder().encode("function test() {}")),
            50
          );
        });
      });

      // Start indexing
      const indexingPromise = indexingService.startIndexing();

      // Wait a bit then cancel
      await new Promise((resolve) => setTimeout(resolve, 10));
      indexingService.stopIndexing();

      // Wait for indexing to complete cancellation logic
      await indexingPromise;

      // Now assert the message
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Indexing was cancelled"
      );
    });
  });

  describe("Indexing stops gracefully when cancelled (edge case)", () => {
    test("should handle cancellation during file processing", async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: "test-index" },
        qdrant_config: { url: "http://localhost:6333" },
        ollama_config: {
          base_url: "http://localhost:11434",
          model: "nomic-embed-text",
        },
      };

      vi.spyOn(mockConfigService, "loadQdrantConfig").mockResolvedValueOnce(
        mockConfig
      );
      vi.spyOn(mockConfigService, "validateConnection").mockResolvedValueOnce(
        true
      );
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: {
          enabled: true,
          maxFiles: 500,
          excludePatterns: [],
          includeExtensions: ["ts", "js"],
        },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
      });

      mockQdrantClient.getCollections.mockResolvedValueOnce({
        collections: [],
      });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([
        vscode.Uri.file("/test/workspace/test.ts"),
      ]);

      vi.mocked(vscode.workspace.fs.readFile).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(new TextEncoder().encode("function test() {}")),
            50
          );
        });
      });

      const indexingPromise = indexingService.startIndexing();

      await new Promise((resolve) => setTimeout(resolve, 10));
      indexingService.stopIndexing();

      await expect(indexingPromise).resolves.toBeUndefined();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Indexing was cancelled"
      );
    });

    // test('should handle cancellation during embedding generation', async () => {
    //     const mockConfig: QdrantOllamaConfig = {
    //         index_info: { name: 'test-index' },
    //         qdrant_config: { url: 'http://localhost:6333' },
    //         ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
    //     };

    //     vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
    //     vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
    //     vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
    //         indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
    //         search: { limit: 10, threshold: 0.7 },
    //         general: { trace: false }
    //     });

    //     mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
    //     mockQdrantClient.createCollection.mockResolvedValueOnce({});

    //     (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
    //         vscode.Uri.file('/test/workspace/test.ts')
    //     ]);

    //     (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
    //         new TextEncoder().encode('function test() {}')
    //     );

    //     (global.fetch as any).mockImplementation(() => {
    //         return new Promise(resolve => {
    //             setTimeout(() => resolve({
    //                 ok: true,
    //                 json: async () => ({ embedding: [0.1, 0.2, 0.3] })
    //             }), 50);
    //         });
    //     });

    //     const indexingPromise = indexingService.startIndexing();

    //     await new Promise(resolve => setTimeout(resolve, 10));
    //     indexingService.stopIndexing();

    //     await expect(indexingPromise).resolves.toBeUndefined();
    //     expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexing was cancelled');
    // });
  });

  describe("dispose", () => {
    test("should clean up resources on dispose", async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: "test-index" },
        qdrant_config: { url: "http://localhost:6333" },
        ollama_config: {
          base_url: "http://localhost:11434",
          model: "nomic-embed-text",
        },
      };

      vi.spyOn(mockConfigService, "loadQdrantConfig").mockResolvedValueOnce(
        mockConfig
      );
      vi.spyOn(mockConfigService, "validateConnection").mockResolvedValueOnce(
        true
      );
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: {
          enabled: true,
          maxFiles: 500,
          excludePatterns: [],
          includeExtensions: ["ts", "js"],
        },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
      });

      vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([]);

      // Use explicit folder to avoid getActiveWorkspaceFolder issues in test env
      const folder = vscode.workspace.workspaceFolders![0];
      const indexingPromise = indexingService.startIndexing(folder);

      // Immediately grab the token source before it might be cleared (though it's cleared in finally)
      const tokenSource = indexingService["_cancellationTokenSource"];
      expect(tokenSource).toBeDefined();

      indexingService.dispose();

      // Should cancel any ongoing indexing
      expect(tokenSource?.cancel).toHaveBeenCalled();

      // Wait for it to finish cleanup
      await indexingPromise;

      // Should clear progress listeners
      expect(indexingService["_progressListeners"]).toEqual([]);
    });
  });
});
