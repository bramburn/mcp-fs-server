import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";
import type * as vscodeTypes from "vscode";
import vscode from "../test/mocks/vscode-api.js";
import { QdrantOllamaConfig } from "../webviews/protocol.js";
import { ConfigService } from "./ConfigService.js";
import type { ILogger } from "./LoggerService.js";

interface MockExtensionContext extends Partial<vscodeTypes.ExtensionContext> {
  globalStorageUri: vscodeTypes.Uri;
}

// Mock React store to prevent issues during import
vi.mock("svelte/store", () => ({
  writable: vi.fn(() => ({
    subscribe: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  })),
  readable: vi.fn(() => ({
    subscribe: vi.fn(),
  })),
  derived: vi.fn(() => ({
    subscribe: vi.fn(),
  })),
}));

// Mock VS Code API globally for the test suite
vi.mock("vscode", () => {
  const mockOnDidChangeConfiguration = vi.fn();
  const mockGet = vi.fn((key?: string) => {
    // Default mock values for new 'semanticSearch' path
    if (key === "trace") return false;
    if (key === "indexingEnabled") return true;
    if (key === "indexingMaxFiles") return 500;
    if (key === "searchLimit") return 10;
    
    // Mock the core provider settings which are read by ConfigurationFactory.from()
    if (key === "activeVectorDb") return "qdrant";
    if (key === "qdrantUrl") return "http://localhost:6333";
    if (key === "activeEmbeddingProvider") return "ollama";
    if (key === "ollamaBaseUrl") return "http://localhost:11434";
    if (key === "embeddingDimension") return 768;


    return "default";
  });

  const mockVscode = {
    workspace: {
      // FIX 1: Renamed '_section' to '_' to explicitly ignore the parameter and fix unused var lint error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      getConfiguration: vi.fn((_: string) => ({ 
        get: mockGet,
        update: vi.fn(),
      })),
      // Mock change event registration
      onDidChangeConfiguration: mockOnDidChangeConfiguration,
      fs: {
        stat: vi.fn(),
        readFile: vi.fn(),
        createDirectory: vi.fn(),
        writeFile: vi.fn(),
      },
      asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
        if (typeof pathOrUri === "string") {
          return pathOrUri.replace("/test/workspace/", "");
        }
        return pathOrUri.fsPath.replace("/test/workspace/", "");
      }),
    },
    Uri: {
      file: vi.fn((path: string) => ({
        fsPath: path,
        scheme: "file",
        path: path,
        query: "",
        fragment: "",
        with: vi.fn(),
        toString: vi.fn(() => path),
      })),
      joinPath: vi.fn((base: vscodeTypes.Uri, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join("/"),
        scheme: "file",
        path: [base.fsPath, ...segments].join("/"),
        query: "",
        fragment: "",
        with: vi.fn(),
        toString: vi.fn(() => [base.fsPath, ...segments].join("/")),
      })),
    },
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
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3
    }
  };

  return {
    default: mockVscode,
    ...mockVscode,
  };
});

// Mock fetch for connection validation
global.fetch = vi.fn();

describe("ConfigService (VS Code Native Config)", () => {
  let configService: ConfigService;
  let mockLogger: ILogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      log: vi.fn(),
    };
    try {
      // Create a mock context object for testing
      const mockContext: MockExtensionContext = {
        globalStorageUri: vscode.Uri.file(
          "/test/global/storage"
        ) as unknown as vscodeTypes.Uri,
        subscriptions: [],
      };
      configService = new ConfigService(
        mockLogger,
        mockContext as unknown as vscodeTypes.ExtensionContext
      );
    } catch (e) {
      console.error("Error instantiating ConfigService:", e);
      throw e;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ConfigService loads new VS Code settings into internal configuration model", () => {
    const config = configService.config;
    // Check indexing settings are loaded using the new paths (default mocks used)
    expect(config.indexing.enabled).toBe(true);
    expect(config.indexing.maxFiles).toBe(500);

    // Check legacy Qdrant config stub is correctly populated from new flat settings
    const qdrantConfig = configService.qdrantConfig;
    expect(qdrantConfig?.active_vector_db).toBe("qdrant");
    expect(qdrantConfig?.qdrant_config?.url).toBe("http://localhost:6333");
    expect(qdrantConfig?.ollama_config?.base_url).toBe("http://localhost:11434");
    expect(qdrantConfig?.index_info?.embedding_dimension).toBe(768);
  });

  test("ConfigService.get returns correct nested values", () => {
    // Note: These key paths still use the internal Config model structure (e.g., 'indexing.enabled')
    expect(configService.get("indexing.enabled")).toBe(true);
    expect(configService.get("indexing.maxFiles")).toBe(500);
    expect(configService.get("search.limit")).toBe(10);
    expect(configService.get("general.trace")).toBe(false);
  });

  test("ConfigService.updateVSCodeSetting updates VS Code configuration", async () => {
    const mockConfigUpdate = vi.fn();
    // FIX 2: Added casting to the whole vi.mocked call to satisfy TypeScript's strict rules when mocking external APIs (TS2769 error)
    vi.mocked(vscode.workspace.getConfiguration as Mock).mockImplementation(() => ({ 
      get: vi.fn(), 
      update: mockConfigUpdate
    } as unknown as vscodeTypes.WorkspaceConfiguration));

    await configService.updateVSCodeSetting("search.limit", 50, true);

    expect(mockConfigUpdate).toHaveBeenCalledWith(
      "semanticSearch.searchLimit", // New unified path
      50,
      vscode.ConfigurationTarget.Global
    );

    // Verify in-memory config is also updated via the loadConfiguration listener flow
    // (We mock the immediate update path in this test, but rely on the update() call within updateVSCodeSetting)
    expect(configService.get("search.limit")).toBe(50);
  });

  test("ConfigService.loadQdrantConfig returns config for migration if file exists", async () => {
    const mockFolder: vscodeTypes.WorkspaceFolder = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    const mockLegacyConfig = {
      active_vector_db: "pinecone" as const,
      active_embedding_provider: "openai" as const,
      index_info: { name: "legacy-index" },
      pinecone_config: { index_name: "test", api_key: "key" },
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    } as unknown as vscodeTypes.FileStat);
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockLegacyConfig))
    );

    const result = await configService.loadQdrantConfig(mockFolder);

    // This confirms the migration utility still works by reading the old file
    expect(result?.active_vector_db).toBe("pinecone");
    expect(result?.index_info?.name).toBe("legacy-index");
    
    // Crucially, it must NOT have set the internal runtime config from the file
    expect(configService.qdrantConfig?.active_vector_db).toBe("qdrant"); 
  });

  test("ConfigService.loadQdrantConfig returns null if legacy file is missing", async () => {
    const mockFolder: vscodeTypes.WorkspaceFolder = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file not found
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce(
      new Error("File not found")
    );

    const result = await configService.loadQdrantConfig(mockFolder);
    expect(result).toBeNull();
  });

  describe("Connection Validation", () => {
    test("validateConnection uses the provided QdrantOllamaConfig instance", async () => {
      const externalConfig: QdrantOllamaConfig = {
        active_vector_db: "qdrant",
        active_embedding_provider: "ollama",
        qdrant_config: { url: "http://external:6333" },
        ollama_config: { base_url: "http://external:11434", model: "test" },
      };

      // Mock successful API calls
      (global.fetch as Mock)
        .mockResolvedValueOnce({ ok: true } as Response) // Ollama
        .mockResolvedValueOnce({ ok: true } as Response); // Qdrant

      await configService.validateConnection(externalConfig);

      // Verify fetch used the URLs from the external config, not the mocked settings
      expect(global.fetch).toHaveBeenCalledWith(
        "http://external:11434/api/tags",
        expect.anything()
      );
      expect(global.fetch).toHaveBeenCalledWith(
        "http://external:6333/collections",
        expect.anything()
      );
    });
  });
});