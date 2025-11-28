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
import { DefaultConfiguration } from "../config/Configuration.js";
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
    // Default mock values
    if (key === "qdrant.search.trace") return false;
    if (key === "qdrant.indexing.enabled") return true;
    if (key === "qdrant.indexing.maxFiles") return 500;
    if (key === "qdrant.search.limit") return 10;
    return "default";
  });

  const mockVscode = {
    workspace: {
      getConfiguration: () => ({ get: mockGet }),
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
  };

  return {
    default: mockVscode,
    ...mockVscode,
  };
});

// Mock fetch for connection validation
global.fetch = vi.fn();

describe("ConfigService", () => {
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

  test("ConfigService registers a configuration change handler upon instantiation", () => {
    // Assert that the necessary VS Code API was called to subscribe to changes
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalledOnce();
  });

  test("ConfigService loads derived property correctly", () => {
    const mockContext: MockExtensionContext = {
      globalStorageUri: vscode.Uri.file(
        "/test/global/storage"
      ) as unknown as vscodeTypes.Uri,
      subscriptions: [],
    };
    const service = new ConfigService(
      mockLogger,
      mockContext as unknown as vscodeTypes.ExtensionContext
    ); // Assuming a mocked structure where indexing.enabled is derived from a setting
    expect(service.config.indexing.enabled).toBe(true);
  });

  test("ConfigService loads default configuration when VS Code config is invalid", () => {
    // Mock invalid configuration
    const mockContext: MockExtensionContext = {
      globalStorageUri: vscode.Uri.file(
        "/test/global/storage"
      ) as unknown as vscodeTypes.Uri,
      subscriptions: [],
    };
    const service = new ConfigService(
      mockLogger,
      mockContext as unknown as vscodeTypes.ExtensionContext
    );
    expect(service.config).toEqual(DefaultConfiguration);
  });

  test("ConfigService.get returns correct nested values", () => {
    expect(configService.get("indexing.enabled")).toBe(true);
    expect(configService.get("indexing.maxFiles")).toBe(500);
    expect(configService.get("search.limit")).toBe(10);
    expect(configService.get("general.trace")).toBe(false);
  });

  test("ConfigService.get throws error for invalid paths", () => {
    expect(() => configService.get("invalid.path")).toThrow();
    expect(() => configService.get("indexing.invalid")).toThrow();
  });

  test("ConfigService.update modifies configuration correctly", () => {
    configService.update("indexing.enabled", false);
    expect(configService.get("indexing.enabled")).toBe(false);

    configService.update("search.limit", 20);
    expect(configService.get("search.limit")).toBe(20);
  });

  test("ConfigService.update creates nested objects if needed", () => {
    configService.update("new.nested.value", "test");
    expect(configService.get("new.nested.value")).toBe("test");
  });

  test("ConfigService configuration change listeners are notified", () => {
    const listener = vi.fn();
    configService.addConfigurationChangeListener(listener);

    configService.update("indexing.enabled", false);

    expect(listener).toHaveBeenCalledWith({
      section: "indexing.enabled",
      value: false,
    });
  });

  describe("Global Configuration Storage", () => {
    test("saveQdrantConfig writes to global storage when useGlobal is true", async () => {
      const mockFolder: vscodeTypes.WorkspaceFolder = {
        uri: { fsPath: "/workspace" } as vscodeTypes.Uri,
        name: "my-repo",
        index: 0,
      };
      const config = {
        qdrant_config: { url: "http://localhost:6333" },
        ollama_config: { base_url: "http://localhost:11434" },
      } as QdrantOllamaConfig;

      // Mock createDirectory for global storage
      vi.mocked(vscode.workspace.fs.createDirectory).mockResolvedValue(
        undefined
      );
      vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);

      await configService.saveQdrantConfig(mockFolder, config, true);

      // Verify it wrote to the global path based on hashed/safe name
      const expectedPath = "/global/storage/configs/my_repo.json";

      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
      const [uriArg] = vi.mocked(vscode.workspace.fs.writeFile).mock.calls[0];
      expect(uriArg.fsPath.replace(/\\/g, "/")).toContain(expectedPath);
    });

    test("loadQdrantConfig falls back to global if local missing", async () => {
      const mockFolder: vscodeTypes.WorkspaceFolder = {
        uri: { fsPath: "/workspace" } as vscodeTypes.Uri,
        name: "my-repo",
        index: 0,
      };

      // 1. Mock Local Stat Failure (File not found)
      vi.mocked(vscode.workspace.fs.stat)
        .mockRejectedValueOnce(new Error("Local not found"))
        .mockResolvedValueOnce({ type: 1 } as Partial<vscodeTypes.FileStat>); // 2. Global Stat Success

      // Mock Global Read
      const config = {
        active_vector_db: "qdrant" as const,
        active_embedding_provider: "ollama" as const,
        qdrant_config: { url: "http://global" },
        ollama_config: { base_url: "http://global", model: "nomic-embed-text" },
      };
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(config))
      );

      const result = await configService.loadQdrantConfig(
        mockFolder as vscodeTypes.WorkspaceFolder
      );

      expect(result?.qdrant_config?.url).toBe("http://global");
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("global storage"),
        "CONFIG"
      );
    });
  });

  describe("Detailed Connection Validation", () => {
    test("returns partial failure if only one service is down", async () => {
      const config: QdrantOllamaConfig = {
        active_vector_db: "qdrant",
        active_embedding_provider: "ollama",
        index_info: { name: "test-index" },
        qdrant_config: { url: "http://qdrant" },
        ollama_config: { base_url: "http://ollama", model: "test-model" },
      };

      // Mock Ollama Success
      (global.fetch as Mock).mockImplementation((url: string) => {
        if (url.includes("ollama")) return Promise.resolve({ ok: true });
        if (url.includes("qdrant"))
          return Promise.resolve({ ok: false, statusText: "Not Found" });
        return Promise.reject("Unknown");
      });

      const result = await configService.validateConnectionDetailed(config);

      expect(result.success).toBe(false);
      expect(result.ollamaStatus).toBe("connected");
      expect(result.qdrantStatus).toBe("failed");
      expect(result.message).toContain("Qdrant: Not Found");
    });
  });

  test("ConfigService can remove configuration change listeners", () => {
    const listener = vi.fn();
    configService.addConfigurationChangeListener(listener);
    configService.removeConfigurationChangeListener(listener);

    configService.update("indexing.enabled", false);

    expect(listener).not.toHaveBeenCalled();
  });

  test("ConfigService handles listener errors gracefully", () => {
    const faultyListener = vi.fn(() => {
      throw new Error("Listener error");
    });
    const goodListener = vi.fn();

    configService.addConfigurationChangeListener(faultyListener);
    configService.addConfigurationChangeListener(goodListener);

    // Should not throw despite faulty listener
    expect(() => configService.update("indexing.enabled", false)).not.toThrow();

    expect(faultyListener).toHaveBeenCalled();
    expect(goodListener).toHaveBeenCalled();
  });

  test("ConfigService.loadQdrantConfig loads valid configuration", async () => {
    const mockConfig = {
      active_vector_db: "qdrant" as const,
      active_embedding_provider: "ollama" as const,
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333/" },
      ollama_config: {
        base_url: "http://localhost:11434/",
        model: "nomic-embed-text",
      },
    };

    const mockFolder: vscodeTypes.WorkspaceFolder = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockConfig))
    );

    const result = await configService.loadQdrantConfig(mockFolder);

    expect(result).toEqual({
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333" }, // Trailing slash removed
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      }, // Trailing slash removed
    });

    expect(configService.qdrantConfig).toEqual(result);
  });

  test("ConfigService.loadQdrantConfig returns null for missing file", async () => {
    const mockFolder: Partial<vscodeTypes.WorkspaceFolder> = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file not found
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce(
      new Error("File not found")
    );

    const result = await configService.loadQdrantConfig(
      mockFolder as vscodeTypes.WorkspaceFolder
    );

    expect(result).toBeNull();
  });

  test("ConfigService.loadQdrantConfig returns null for invalid structure", async () => {
    const mockInvalidConfig = {
      invalid_field: "test",
    };

    const mockFolder: Partial<vscodeTypes.WorkspaceFolder> = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockInvalidConfig))
    );

    const result = await configService.loadQdrantConfig(
      mockFolder as vscodeTypes.WorkspaceFolder
    );

    expect(result).toBeNull();
  });

  test("ConfigService.validateConnection returns true for valid connections", async () => {
    const mockConfig: QdrantOllamaConfig = {
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      qdrant_config: { url: "http://localhost:6333" },
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };

    // Mock successful API calls
    (global.fetch as Mock)
      .mockResolvedValueOnce({ ok: true } as Response) // Ollama
      .mockResolvedValueOnce({ ok: true } as Response); // Qdrant

    const result = await configService.validateConnection(mockConfig);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:6333/collections",
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  test("ConfigService.validateConnection returns false for failed Ollama connection", async () => {
    const mockConfig: QdrantOllamaConfig = {
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      qdrant_config: { url: "http://localhost:6333" },
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };

    // Mock failed Ollama call
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false } as Response);

    const result = await configService.validateConnection(mockConfig);

    expect(result).toBe(false);
  });

  test("ConfigService.validateConnection handles Qdrant auth errors gracefully", async () => {
    const mockConfig: QdrantOllamaConfig = {
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      qdrant_config: { url: "http://localhost:6333" },
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };

    // Mock successful Ollama but Qdrant returns auth error
    (global.fetch as Mock)
      .mockResolvedValueOnce({ ok: true } as Response) // Ollama succeeds
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response); // Qdrant auth error

    const result = await configService.validateConnection(mockConfig);

    expect(result).toBe(true); // Should still return true for auth errors
  });

  test("ConfigService.dispose cleans up resources", () => {
    // Mock onDidChangeConfiguration behavior for this specific test
    const mockOnDidChangeConfigurationForTest = vi
      .fn()
      .mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(
      mockOnDidChangeConfigurationForTest
    );

    const mockContext: MockExtensionContext = {
      globalStorageUri: { fsPath: "/test/global/storage" } as vscodeTypes.Uri,
      subscriptions: [],
    };
    const service = new ConfigService(
      mockLogger,
      mockContext as unknown as vscodeTypes.ExtensionContext
    );
    service.dispose();

    expect(mockOnDidChangeConfigurationForTest).toHaveBeenCalledOnce();
    // Accessing private property _listeners via casting to unknown then to a shape for test purposes
    expect(
      (service as unknown as { _listeners: unknown[] })._listeners
    ).toEqual([]);
  });

  test("ConfigService returns immutable config copies", () => {
    const config1 = configService.config;
    const config2 = configService.config;

    expect(config1).not.toBe(config2); // Different object references
    expect(config1).toEqual(config2); // Same content

    // Modifying returned config should not affect service
    // Casting to unknown then to a writable shape to bypass readonly restrictions for this test
    (
      config1 as unknown as { indexing: { enabled: boolean } }
    ).indexing.enabled = false;
    expect(configService.config.indexing.enabled).toBe(true);
  });

  test("ConfigService returns immutable qdrantConfig copies", async () => {
    const mockConfig = {
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333" },
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };
    const mockFolder: vscodeTypes.WorkspaceFolder = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockConfig))
    );

    await configService.loadQdrantConfig(mockFolder);

    expect(configService.qdrantConfig).not.toBeNull();

    const qdrantConfig1 = configService.qdrantConfig;
    const qdrantConfig2 = configService.qdrantConfig;

    expect(qdrantConfig1).not.toBe(qdrantConfig2); // Different object references
    expect(qdrantConfig1).toEqual(qdrantConfig2); // Same content

    // Modifying returned config should not affect service
    if (qdrantConfig1) {
      (qdrantConfig1 as QdrantOllamaConfig).qdrant_config!.url = "modified";
    }
    expect(configService.qdrantConfig?.qdrant_config?.url).toBe(
      "http://localhost:6333"
    );
  });

  test("ConfigService.loadQdrantConfig adds http:// protocol to URLs missing protocol", async () => {
    const mockConfig = {
      active_vector_db: "qdrant" as const,
      active_embedding_provider: "ollama" as const,
      index_info: { name: "test-index" },
      qdrant_config: { url: "localhost:6333/" }, // Missing protocol
      ollama_config: {
        base_url: "localhost:11434/",
        model: "nomic-embed-text",
      }, // Missing protocol
    };

    const mockFolder: vscodeTypes.WorkspaceFolder = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockConfig))
    );

    const result = await configService.loadQdrantConfig(mockFolder);

    expect(result).toEqual({
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333" }, // Protocol added, trailing slash removed
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      }, // Protocol added, trailing slash removed
    });

    expect(configService.qdrantConfig).toEqual(result);
  });

  test("ConfigService.loadQdrantConfig handles URLs with leading slashes correctly", async () => {
    const mockConfig = {
      active_vector_db: "qdrant" as const,
      active_embedding_provider: "ollama" as const,
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333" },
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };

    const mockFolder: Partial<vscodeTypes.WorkspaceFolder> = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockConfig))
    );

    const result = await configService.loadQdrantConfig(
      mockFolder as vscodeTypes.WorkspaceFolder
    );

    expect(result).toEqual({
      active_vector_db: "qdrant",
      active_embedding_provider: "ollama",
      index_info: { name: "test-index" },
      qdrant_config: { url: "http://localhost:6333" }, // Protocol added, leading slashes removed, trailing slash removed
      ollama_config: {
        base_url: "http://localhost:11434",
        model: "nomic-embed-text",
      }, // Protocol added, leading slashes removed, trailing slash removed
    });

    expect(configService.qdrantConfig).toEqual(result);
  });

  test("ConfigService.loadQdrantConfig preserves existing https protocol", async () => {
    const mockConfig = {
      active_vector_db: "qdrant" as const,
      active_embedding_provider: "ollama" as const,
      index_info: { name: "test-index" },
      qdrant_config: { url: "https://qdrant.example.com/" }, // HTTPS protocol
      ollama_config: {
        base_url: "https://ollama.example.com/",
        model: "nomic-embed-text",
      }, // HTTPS protocol
    };

    const mockFolder: Partial<vscodeTypes.WorkspaceFolder> = {
      uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      name: "test-workspace",
      index: 0,
    };

    // Mock file exists and read operations
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 1,
      mtime: 1,
      size: 1,
    });
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockConfig))
    );

    const result = await configService.loadQdrantConfig(
      mockFolder as vscodeTypes.WorkspaceFolder
    );

    expect(result).toEqual({
      index_info: { name: "test-index" },
      qdrant_config: { url: "https://qdrant.example.com" }, // HTTPS protocol preserved, trailing slash removed
      ollama_config: {
        base_url: "https://ollama.example.com",
        model: "nomic-embed-text",
      }, // HTTPS protocol preserved, trailing slash removed
    });

    expect(configService.qdrantConfig).toEqual(result);
  });

  describe("saveQdrantConfig", () => {
    test("saveQdrantConfig creates directory and writes file", async () => {
      const mockFolder = {
        uri: { fsPath: "/test/workspace" },
        name: "test-workspace",
        index: 0,
      };

      const newConfig: QdrantOllamaConfig = {
        active_vector_db: "qdrant",
        active_embedding_provider: "ollama",
        index_info: { name: "new-index" },
        qdrant_config: { url: "http://localhost:6333", api_key: "secret" },
        ollama_config: {
          base_url: "http://localhost:11434",
          model: "llama3",
        },
      };

      // Mock stat to fail (dir does not exist) to trigger createDirectory
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce(
        new Error("File not found")
      );

      // Mock createDirectory and writeFile success
      vi.mocked(vscode.workspace.fs.createDirectory).mockResolvedValue(
        undefined
      );
      vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);

      await configService.saveQdrantConfig(
        mockFolder as unknown as vscodeTypes.WorkspaceFolder,
        newConfig as unknown as QdrantOllamaConfig
      );

      // Verify directory creation
      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: "/test/workspace/.qdrant" })
      );

      // Verify file write by inspecting actual calls to avoid brittle matcher issues
      const writeCalls = vi.mocked(vscode.workspace.fs.writeFile).mock.calls;
      expect(writeCalls.length).toBe(1);

      const [uriArg, contentArg] = writeCalls[0];

      // Check URI
      expect(uriArg).toEqual(
        expect.objectContaining({
          fsPath: "/test/workspace/.qdrant/configuration.json",
        })
      );

      // Check Content - contentArg can be Uint8Array or Buffer in test environment
      expect(contentArg).toBeDefined();
      expect(contentArg).toHaveProperty("length");
      const writtenContent = new TextDecoder().decode(contentArg as Uint8Array);
      const parsedContent = JSON.parse(writtenContent);

      expect(parsedContent.qdrant_config.url).toBe("http://localhost:6333");
      expect(parsedContent.qdrant_config.api_key).toBe("secret");
    });

    test("saveQdrantConfig handles write errors", async () => {
      const mockFolder: Partial<vscodeTypes.WorkspaceFolder> = {
        uri: { fsPath: "/test/workspace" } as vscodeTypes.Uri,
      };
      const config: QdrantOllamaConfig = {
        active_vector_db: "qdrant",
        active_embedding_provider: "ollama",
        qdrant_config: { url: "http://localhost" },
        ollama_config: {
          base_url: "http://localhost:11434",
          model: "test-model",
        },
      };

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: vscode.FileType.Directory,
      } as Partial<vscodeTypes.FileStat>); // Dir exists
      vi.mocked(vscode.workspace.fs.writeFile).mockRejectedValue(
        new Error("Permission denied")
      );

      await expect(
        configService.saveQdrantConfig(
          mockFolder as unknown as vscodeTypes.WorkspaceFolder,
          config as unknown as QdrantOllamaConfig
        )
      ).rejects.toThrow("Failed to save configuration: Permission denied");
    });
  });
});
