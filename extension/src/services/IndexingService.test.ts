import { QdrantClient } from "@qdrant/js-client-rest";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
// ✅ FIX: Import mocked vscode instead of real vscode API
import vscode from "../test/mocks/vscode-api.js";
import type * as vscodeTypes from "vscode"; // Type-only import for interfaces
import { VSCodeSettings } from "../webviews/protocol.js";
import { ConfigService } from "./ConfigService.js";
import { IndexingService } from "./IndexingService.js";
import { ILogger } from "./LoggerService.js";
import { AnalyticsService } from "./AnalyticsService.js";
import type { IEmbeddingProvider } from "./embedding-providers/IEmbeddingProvider.js";
import type { IVectorStore } from "./vector-stores/IVectorStore.js";
import { SettingsManager } from "../settings.js";


// Mock Qdrant client
vi.mock("@qdrant/js-client-rest");

// Mock SettingsManager which holds the new VS Code Settings source of truth
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

// Mock SettingsManager directly since the IndexingService should rely on it now
vi.mock("../settings.js", () => ({
  SettingsManager: {
    getSettings: vi.fn(() => mockSettings),
    updateSettings: vi.fn(),
  },
}));

// Mock shared code splitter (must match the actual import specifier)
vi.mock("../shared/code-splitter.js", () => ({
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

// Mock VS Code API globally for the test suite
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
    token: {
      isCancellationRequested: boolean;
      onCancellationRequested: (callback: () => void) => {
        dispose: () => void;
      };
    } = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
    };
    cancel = vi.fn(() => {
      this.token.isCancellationRequested = true;
    });
    dispose = vi.fn();
  };

  const mockVscode = {
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
      joinPath: vi.fn((base: vscodeTypes.Uri, ...segments: string[]) => ({
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
    CancellationTokenSource: MockCancellationTokenSource as unknown as vscodeTypes.CancellationTokenSource, 
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

  return {
    default: mockVscode,
    ...mockVscode,
  };
});

global.fetch = vi.fn();

describe("IndexingService", () => {
  let indexingService: IndexingService;
  let mockConfigService: ConfigService;
  let mockContext: vscodeTypes.ExtensionContext;
  let mockQdrantClient: QdrantClient;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: "/test/extension" },
      subscriptions: [],
    } as unknown as vscodeTypes.ExtensionContext;

    mockLogger = {
      log: vi.fn(),
    };

    // ConfigService is still used for general VS Code settings and event handling
    mockConfigService = new ConfigService(mockLogger, mockContext);

    // Create mock AnalyticsService
    const mockAnalyticsService: Partial<AnalyticsService> = {
      trackEvent: vi.fn(),
      trackPageView: vi.fn(),
      trackCommand: vi.fn(),
      trackIndexing: vi.fn(),
      trackSearch: vi.fn(),
      trackError: vi.fn(),
      dispose: vi.fn(),
    };

    indexingService = new IndexingService(
      mockConfigService,
      mockContext,
      mockAnalyticsService as AnalyticsService,
      mockLogger
    );

    mockQdrantClient = {
      getCollections: vi.fn(),
      createCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(),
      delete: vi.fn(),
    } as unknown as QdrantClient;

    (QdrantClient as unknown as Mock).mockImplementation(() => mockQdrantClient);

    vi.clearAllMocks();

    // Mock successful connection check internally used by IndexingService
    // NOTE: This mock is required because IndexingService internally creates providers and calls validateConnectionDetailed.
    vi.spyOn(mockConfigService, "validateConnectionDetailed").mockResolvedValue({
      success: true,
      message: "Connection successful",
      ollamaStatus: "connected",
      qdrantStatus: "connected",
    });

    // Mock embedding provider dimension detection
    indexingService["_embeddingProvider"] = {
        generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]), // 8 dimensions for test
        getEmbeddingDimension: vi.fn().mockResolvedValue(8)
    } as unknown as IEmbeddingProvider;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("startIndexing", () => {
    test("should initialize providers and vector store using VSCodeSettings", async () => {
      // Mock VS Code API calls used by IndexingService during indexing
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: {
          enabled: true,
          maxFiles: 500,
          excludePatterns: [],
          includeExtensions: ["ts", "js"],
        },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
        qdrantConfig: {
            active_vector_db: "qdrant",
            active_embedding_provider: "ollama",
            index_info: { name: "test-index", embedding_dimension: 768 },
            qdrant_config: { url: "http://localhost:6333", api_key: "test-key" },
            ollama_config: { base_url: "http://localhost:11434", model: "nomic-embed-text" }
        },
        semanticSearch: {
            pineconeHost: ""
        }
      });

      // Mock finding files
      vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([]);

      // Mock Qdrant client to succeed
      (mockQdrantClient.getCollections as Mock).mockResolvedValueOnce({
        collections: [],
      });
      (mockQdrantClient.createCollection as Mock).mockResolvedValueOnce({});

      // Start indexing
      await indexingService.startIndexing();

      // Check if providers were initialized (mocked internal behavior)
      expect(indexingService["_embeddingProvider"]).toBeDefined();
      expect(indexingService["_vectorStore"]).toBeDefined();

      // Check if collection ensured (using the dimension mocked above)
      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        mockSettings.indexName,
        expect.objectContaining({
          vectors: {
            size: 768, // Expects fallback dimension (768) as provider is mocked via factory
            distance: "Cosine",
          },
        })
      );
    });

    test("should handle no files found gracefully", async () => {
        vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
          indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
          search: { limit: 10, threshold: 0.7 },
          general: { trace: false },
          qdrantConfig: {
            active_vector_db: "qdrant",
            active_embedding_provider: "ollama",
            index_info: { name: "test-index", embedding_dimension: 768 },
            qdrant_config: { url: "http://localhost:6333", api_key: "test-key" },
            ollama_config: { base_url: "http://localhost:11434", model: "nomic-embed-text" }
          },
          semanticSearch: { pineconeHost: "" }
        });

        vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([]);
        (mockQdrantClient.getCollections as Mock).mockResolvedValueOnce({ collections: [] });
        indexingService["_vectorStore"] = { ensureCollection: vi.fn().mockResolvedValue(undefined) } as unknown as IVectorStore;

        await indexingService.startIndexing();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("Indexed 0 files successfully")
        );
        expect(indexingService.isIndexing).toBe(false);
    });
  });

  describe("stopIndexing", () => {
    test("should cancel indexing when stopIndexing is called", async () => {
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: {
          enabled: true,
          maxFiles: 500,
          excludePatterns: [],
          includeExtensions: ["ts", "js"],
        },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
        qdrantConfig: {
            active_vector_db: "qdrant",
            active_embedding_provider: "ollama",
            index_info: { name: "test-index", embedding_dimension: 768 },
            qdrant_config: { url: "http://localhost:6333", api_key: "test-key" },
            ollama_config: { base_url: "http://localhost:11434", model: "nomic-embed-text" }
        },
        semanticSearch: { pineconeHost: "" }
      });

      (mockQdrantClient.getCollections as Mock).mockResolvedValueOnce({
        collections: [],
      });
      (mockQdrantClient.createCollection as Mock).mockResolvedValueOnce({});

      // Mock file reading to be slow so we can cancel it
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

  describe("initializeForSearch", () => {
    test("should successfully initialize providers using VSCodeSettings", async () => {
      // Mock ConfigService general config (still needed for trace/indexing flags)
      vi.spyOn(mockConfigService, "config", "get").mockReturnValue({
        indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
        search: { limit: 10, threshold: 0.7 },
        general: { trace: false },
        qdrantConfig: {
            active_vector_db: "qdrant",
            active_embedding_provider: "ollama",
            index_info: { name: "test-index", embedding_dimension: 768 },
            qdrant_config: { url: "http://localhost:6333", api_key: "test-key" },
            ollama_config: { base_url: "http://localhost:11434", model: "nomic-embed-text" }
        },
        semanticSearch: { pineconeHost: "" }
      });
      
      const folder = vscode.workspace.workspaceFolders![0];
      const result = await indexingService.initializeForSearch(folder);

      expect(result).toBe(true);
      expect(indexingService["_embeddingProvider"]).toBeDefined();
      expect(indexingService["_vectorStore"]).toBeDefined();

      // Check connection validation was called
      expect(mockConfigService.validateConnectionDetailed).toHaveBeenCalled();
    });
  });
});