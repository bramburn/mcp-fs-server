import { QdrantClient } from "@qdrant/js-client-rest";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { QdrantOllamaConfig } from "../webviews/protocol.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { ConfigService } from "./ConfigService.js";
import { ILogger } from "./LoggerService.js";
// Use a relative import so compiled extension can resolve this at runtime
// when packaged and installed in VS Code. The previous bare "shared" import
// relied on TS path aliases and failed in extension host.
import { SettingsManager } from "../settings.js"; // Import SettingsManager
import { CodeSplitter } from "../shared/code-splitter.js";
import { WorkspaceManager } from "./WorkspaceManager.js"; // Import WorkspaceManager

// Import types
import {
  IndexingProgress,
  IndexingProgressListener,
  SearchResultItem,
} from "./types.js";

// Import embedding providers
import {
  GeminiEmbeddingProvider,
  IEmbeddingProvider,
  OllamaEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from "./embedding-providers/index.js";

// Import vector stores
import {
  IVectorStore,
  PineconeVectorStore,
  QdrantVectorStore,
} from "./vector-stores/index.js";

// Re-export types for backward compatibility
export type {
  IEmbeddingProvider,
  IndexingProgress,
  IndexingProgressListener,
  IVectorStore,
  SearchResultItem,
};

/**
 * Core service to handle file indexing and interaction with Qdrant/Ollama
 * with proper cancellation token support and dependency injection
 */
export class IndexingService implements vscode.Disposable {
  private _isIndexing = false;
  private _client: QdrantClient | null = null;
  private _activeConfig: QdrantOllamaConfig | null = null;
  private _splitter: CodeSplitter;
  private _cancellationTokenSource: vscode.CancellationTokenSource | undefined;
  private _progressListeners: IndexingProgressListener[] = [];

  // Provider instances
  private _embeddingProvider: IEmbeddingProvider | null = null;
  private _vectorStore: IVectorStore | null = null;

  // Connection pool management for reusing existing connections
  private _connectionPool: Map<string, QdrantClient> = new Map();
  private _maxPoolSize = 5; // Maximum number of connections to keep in pool

  constructor(
    private readonly _configService: ConfigService,
    private readonly _context: vscode.ExtensionContext,
    private readonly _analyticsService: AnalyticsService,
    private readonly _logger: ILogger,
    // Inject WorkspaceManager to access GitProvider
    private readonly _workspaceManager: WorkspaceManager
  ) {
    this._splitter = new CodeSplitter();
  }

  /**
   * Generates a stable deterministic ID for a repository.
   */
  public async getRepoId(folder: vscode.WorkspaceFolder): Promise<string> {
    const gitProvider = this._workspaceManager.gitProvider;
    let key = folder.uri.fsPath;

    if (gitProvider) {
      const remote = await gitProvider.getRemoteUrl(folder.uri.fsPath);
      if (remote) {
        // Normalize remote (remove .git, trim whitespace)
        key = remote.trim().replace(/\.git$/, "");
      }
    }

    return crypto.createHash("md5").update(key).digest("hex");
  }

  /**
   * Retrieves the stored index state for a specific repo ID.
   */
  public getRepoIndexState(repoId: string) {
    const states = SettingsManager.getRepoIndexStates();
    return states[repoId];
  }

  /**
   * Initialize the splitter with WASM resources
   */
  public async initializeSplitter(): Promise<void> {
    try {
      const wasmPath = vscode.Uri.joinPath(
        this._context.extensionUri,
        "resources",
        "tree-sitter.wasm"
      ).fsPath;
      const langPath = vscode.Uri.joinPath(
        this._context.extensionUri,
        "resources",
        "tree-sitter-typescript.wasm"
      ).fsPath;
      await this._splitter.initialize(wasmPath, langPath);
    } catch {
      this._logger.log(
        "Failed to init splitter WASM (falling back to line split)",
        "WARN"
      );
    }
  }

  /**
   * Initialize the indexing service for search operations
   * This sets up the vector store, embedding provider, and configuration
   * without performing a full re-index
   */
  public async initializeForSearch(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _folder: vscode.WorkspaceFolder // Folder is now only used for context, config is global
  ): Promise<boolean> {
    // If already initialized, return success
    if (this._vectorStore && this._activeConfig) {
      this._logger.log(
        "[INIT] IndexingService already initialized for search",
        "INFO"
      );
      return true;
    }

    try {
      this._logger.log(
        "[INIT] Initializing IndexingService for search operations",
        "INFO"
      );

      // --- CRITICAL CHANGE: Load config directly from ConfigService ---
      const config = this._configService.config.qdrantConfig;
      if (!config) {
        this._logger.log(
          "[INIT] Failed to retrieve Qdrant configuration from settings",
          "ERROR"
        );
        return false;
      }

      this._logger.log(
        `[INIT] Configuration loaded from VS Code settings: ${config.active_vector_db}`,
        "INFO"
      );

      // Validate connections
      this._logger.log("[INIT] Validating connections...", "INFO");
      const isHealthy = await this.retryWithBackoff(
        () => this._configService.validateConnection(config),
        3,
        1000
      );

      if (!isHealthy) {
        this._logger.log("[INIT] Connection validation failed", "ERROR");
        return false;
      }

      this._logger.log("[INIT] Connections validated successfully", "INFO");

      // Store active config
      this._activeConfig = config;

      // Initialize embedding provider
      this._logger.log("[INIT] Initializing embedding provider...", "INFO");
      this._embeddingProvider = this.createEmbeddingProvider(config);
      this._logger.log(
        `[INIT] ✓ Embedding provider initialized: ${config.active_embedding_provider}`,
        "INFO"
      );

      // Initialize vector store client
      if (config.active_vector_db === "qdrant" && config.qdrant_config) {
        this._logger.log("[INIT] Initializing Qdrant client...", "INFO");
        this._client = this.getOrCreateClient(
          config.qdrant_config.url,
          config.qdrant_config.api_key
        );
        this._logger.log("[INIT] ✓ Qdrant client initialized", "INFO");
      }

      // Create vector store instance
      this._logger.log("[INIT] Initializing vector store...", "INFO");
      this._vectorStore = this.createVectorStore(config);
      this._logger.log(
        `[INIT] ✓ Vector store initialized: ${config.active_vector_db}`,
        "INFO"
      );

      this._logger.log(
        "[INIT] ✓ IndexingService successfully initialized for search",
        "INFO"
      );
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._logger.log(
        `[INIT] Failed to initialize for search: ${errorMsg}`,
        "ERROR"
      );
      return false;
    }
  }

  /**
   * Add a listener for indexing progress
   */
  public addProgressListener(listener: IndexingProgressListener): void {
    this._progressListeners.push(listener);
  }

  /**
   * Remove a progress listener
   */
  public removeProgressListener(listener: IndexingProgressListener): void {
    const index = this._progressListeners.indexOf(listener);
    if (index > -1) {
      this._progressListeners.splice(index, 1);
    }
  }

  private notifyProgress(progress: IndexingProgress): void {
    this._progressListeners.forEach((listener) => {
      try {
        listener(progress);
      } catch (error) {
        this._logger.log(`Error in progress listener: ${error}`, "ERROR");
      }
    });
  }

  /**
   * Factory method to create the appropriate embedding provider based on config
   */
  private createEmbeddingProvider(
    config: QdrantOllamaConfig
  ): IEmbeddingProvider {
    const provider = config.active_embedding_provider;

    switch (provider) {
      case "ollama": {
        if (!config.ollama_config) {
          throw new Error("Ollama config is required but not provided");
        }
        return new OllamaEmbeddingProvider(
          config.ollama_config.base_url,
          config.ollama_config.model,
          this._logger,
          this.retryWithBackoff.bind(this)
        );
      }

      case "openai": {
        if (!config.openai_config) {
          throw new Error("OpenAI config is required but not provided");
        }
        return new OpenAIEmbeddingProvider(
          config.openai_config.api_key,
          config.openai_config.model,
          this._logger
        );
      }

      case "gemini": {
        if (!config.gemini_config) {
          throw new Error("Gemini config is required but not provided");
        }
        return new GeminiEmbeddingProvider(
          config.gemini_config.api_key,
          config.gemini_config.model,
          this._logger
        );
      }

      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(`Unknown embedding provider: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Factory method to create the appropriate vector store based on config
   */
  private createVectorStore(config: QdrantOllamaConfig): IVectorStore {
    const vectorDb = config.active_vector_db;

    switch (vectorDb) {
      case "qdrant": {
        if (!this._client) {
          throw new Error("Qdrant client is not initialized");
        }
        return new QdrantVectorStore(this._client, this._logger);
      }

      case "pinecone": {
        if (!config.pinecone_config) {
          throw new Error("Pinecone config is required but not provided");
        }
        // Retrieve host from VS Code settings directly as it might not be in the legacy QdrantOllamaConfig structure
        // ConfigService.config returns the robust Configuration object
        const vsCodeConfig = this._configService.config;
        const host = vsCodeConfig.semanticSearch?.pineconeHost;

        return new PineconeVectorStore(
          config.pinecone_config.index_name,
          config.pinecone_config.api_key,
          this._logger,
          host
        );
      }

      default: {
        const exhaustiveCheck: never = vectorDb;
        throw new Error(`Unknown vector database: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Triggers indexing process for given workspace folder with cancellation support
   */
  public async startIndexing(folder?: vscode.WorkspaceFolder): Promise<void> {
    if (this._isIndexing) {
      vscode.window.showWarningMessage("Indexing is already in progress.");
      return;
    }

    this._isIndexing = true;
    this._cancellationTokenSource = new vscode.CancellationTokenSource();
    const token = this._cancellationTokenSource.token;

    // Track if operation was cancelled
    let wasCancelled = false;

    try {
      this._logger.log("=".repeat(60));
      this._logger.log("[INDEXING] Starting indexing process...");
      this._logger.log("=".repeat(60));

      this.notifyProgress({
        current: 0,
        total: 0,
        status: "starting",
      });

      // Get active workspace folder if not provided
      const workspaceFolder =
        folder || this._workspaceManager.getActiveWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error("No active workspace folder found");
      }

      this._logger.log(
        `[INDEXING] Workspace: ${workspaceFolder.name} (${workspaceFolder.uri.fsPath})`
      );

      // 1. Compute Repo Identity
      const repoId = await this.getRepoId(workspaceFolder);
      const gitProvider = this._workspaceManager.gitProvider;
      // Get last commit, or use "HEAD" if Git provider is not available or no commits
      const currentCommit =
        (await gitProvider?.getLastCommit(workspaceFolder.uri.fsPath)) ||
        "HEAD";

      this._logger.log(
        `[INDEXING] RepoID: ${repoId}, Commit: ${currentCommit}`
      );

      // --- CRITICAL CHANGE: Load config directly from ConfigService ---
      const config = this._configService.config.qdrantConfig;
      if (!config) {
        throw new Error(
          `No valid configuration found in VS Code settings. Please open settings and configure providers.`
        );
      }

      this._logger.log(
        `[INDEXING] Configuration loaded successfully from VS Code settings`
      );
      this._logger.log(`[INDEXING] Vector DB: ${config.active_vector_db}`);
      this._logger.log(
        `[INDEXING] Embedding Provider: ${config.active_embedding_provider}`
      );
      this._logger.log(
        `[INDEXING] Collection Name: ${config.index_info?.name || "codebase"}`
      );

      // Validate connections before starting heavy work with retry logic
      this._logger.log(`[INDEXING] Validating connections...`);
      const connectionStartTime = Date.now();
      const isHealthy = await this.retryWithBackoff(
        () => this._configService.validateConnection(config),
        3, // Max retries for connection validation
        1000 // 1 second delay
      );
      const connectionDuration = Date.now() - connectionStartTime;

      if (isHealthy) {
        this._logger.log(
          `[INDEXING] ✓ Connection validated successfully in ${connectionDuration}ms`
        );
        this._analyticsService.trackEvent("connection_success", {
          connectionDuration,
          vectorDb: config.active_vector_db,
          embeddingProvider: config.active_embedding_provider,
        });
      } else {
        this._logger.log(
          `[INDEXING] ✗ Connection validation failed after ${connectionDuration}ms`,
          "ERROR"
        );
        this._analyticsService.trackEvent("connection_failed", {
          connectionDuration,
          vectorDb: config.active_vector_db,
          embeddingProvider: config.active_embedding_provider,
        });
        throw new Error(
          "Could not connect to the configured vector database or embedding provider. Check your configuration and ensure services are running."
        );
      }

      this._activeConfig = config;

      // Initialize embedding provider
      this._logger.log(`[INDEXING] Initializing embedding provider...`);
      this._embeddingProvider = this.createEmbeddingProvider(config);
      this._logger.log(
        `[INDEXING] ✓ Embedding provider initialized: ${config.active_embedding_provider}`
      );

      // Initialize vector store (Qdrant-specific setup)
      if (config.active_vector_db === "qdrant" && config.qdrant_config) {
        this._logger.log(`[INDEXING] Initializing Qdrant client...`);
        this._client = this.getOrCreateClient(
          config.qdrant_config.url,
          config.qdrant_config.api_key
        );
        this._logger.log(
          `[INDEXING] ✓ Qdrant client initialized (using connection pool)`
        );
      }

      // Create vector store instance
      this._logger.log(`[INDEXING] Initializing vector store...`);
      this._vectorStore = this.createVectorStore(config);
      this._logger.log(
        `[INDEXING] ✓ Vector store initialized: ${config.active_vector_db}`
      );

      // Initialize Splitter with WASM paths
      try {
        const wasmPath = vscode.Uri.joinPath(
          this._context.extensionUri,
          "resources",
          "tree-sitter.wasm"
        ).fsPath;
        const langPaths = {
          typescript: vscode.Uri.joinPath(
            this._context.extensionUri,
            "resources",
            "tree-sitter-typescript.wasm"
          ).fsPath,
          dart: vscode.Uri.joinPath( // <-- ADDED DART
            this._context.extensionUri,
            "resources",
            "tree-sitter-dart.wasm"
          ).fsPath,
        };
        await this._splitter.initialize(wasmPath, langPaths);
      } catch {
        this._logger.log(
          "Failed to init splitter WASM (falling back to line split)",
          "WARN"
        );
      }

      vscode.window.setStatusBarMessage(
        "$(sync~spin) Qdrant: Indexing...",
        3000
      );

      const collectionName = config.index_info?.name || "codebase";

      // Detect embedding dimension dynamically
      const vectorDimension = await this.detectEmbeddingDimension(token);
      this._logger.log(
        `[INDEXING] Using detected vector dimension: ${vectorDimension}`
      );

      // Ensure Collection Exists with dynamic dimension
      await this.ensureCollection(collectionName, vectorDimension, token);

      // Find files using configuration
      const configSettings = this._configService.config;
      const excludePattern =
        configSettings.indexing.excludePatterns.length > 0
          ? new vscode.RelativePattern(
              workspaceFolder,
              `{${configSettings.indexing.excludePatterns.join(",")}}`
            )
          : undefined;

      const includePattern =
        configSettings.indexing.includeExtensions.length > 0
          ? new vscode.RelativePattern(
              workspaceFolder,
              `**/*.{${configSettings.indexing.includeExtensions.join(",")}}`
            )
          : new vscode.RelativePattern(workspaceFolder, "**/*");

      this._logger.log(`[INDEXING] Scanning for files...`);
      const maxResults =
        configSettings.indexing.maxFiles === 0
          ? undefined
          : configSettings.indexing.maxFiles;

      const files = await vscode.workspace.findFiles(
        includePattern,
        excludePattern,
        maxResults
      );
      this._logger.log(`[INDEXING] Found ${files.length} files to index.`);

      // Check for cancellation before starting heavy work
      if (token.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      this.notifyProgress({
        current: 0,
        total: files.length,
        status: "indexing",
      });

      let processedCount = 0;

      // Parallel Indexing Configuration
      const CONCURRENCY_LIMIT = 8;
      const queue = [...files];
      const activeWorkers: Promise<void>[] = [];

      this._logger.log(
        `[INDEXING] Starting parallel indexing with concurrency: ${CONCURRENCY_LIMIT}`
      );

      // Worker function
      const worker = async (id: number) => {
        while (queue.length > 0) {
          if (token.isCancellationRequested || wasCancelled) return;

          const fileUri = queue.shift();
          if (!fileUri) return;

          try {
            const relativePath = vscode.workspace.asRelativePath(fileUri);
            this._logger.log(
              `[INDEXING] Worker ${id} processing: ${relativePath}`
            );

            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = new TextDecoder().decode(content);

            await this.indexFile(
              collectionName,
              relativePath,
              text,
              token,
              repoId,
              currentCommit
            );
            processedCount++;

            this.notifyProgress({
              current: processedCount,
              total: files.length,
              currentFile: relativePath,
              status: "indexing",
            });
          } catch (err) {
            // Enhanced error handling for both cancellation and other errors
            if (err instanceof Error && err.message === "Indexing cancelled") {
              wasCancelled = true;
              return; // Stop worker
            }
            if (token.isCancellationRequested) {
              wasCancelled = true;
              return; // Stop worker
            }
            this._logger.log(
              `[INDEXING] Failed to index file ${fileUri.fsPath}: ${err}`,
              "ERROR"
            );
          }
        }
      };

      // Start workers
      for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        activeWorkers.push(worker(i + 1));
      }

      // Wait for all workers to finish
      await Promise.all(activeWorkers);

      if (token.isCancellationRequested) {
        wasCancelled = true;
        throw new Error("Indexing cancelled");
      }

      // Only show success message if not cancelled
      if (!wasCancelled && !token.isCancellationRequested) {
        // 2. Persist Index State on Success
        await SettingsManager.updateRepoIndexState(repoId, {
          repoId,
          lastIndexedCommit: currentCommit,
          lastIndexedAt: Date.now(),
          vectorCount: processedCount, // Approximation, ideally query DB or get actual count from store
        });

        this.notifyProgress({
          current: processedCount,
          total: files.length,
          status: "completed",
        });

        this._logger.log("=".repeat(60));
        this._logger.log(`[INDEXING] ✓ Indexing completed successfully!`);
        this._logger.log(
          `[INDEXING] Total files processed: ${processedCount}/${files.length}`
        );
        this._logger.log(`[INDEXING] Collection: ${collectionName}`);
        this._logger.log("=".repeat(60));

        vscode.window.showInformationMessage(
          `Indexed ${processedCount} files successfully to collection '${collectionName}'.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Indexing cancelled") {
        this.notifyProgress({
          current: 0,
          total: 0,
          status: "cancelled",
        });
        this._logger.log("=".repeat(60));
        this._logger.log("[INDEXING] ⚠ Indexing was cancelled by user");
        this._logger.log("=".repeat(60));
        vscode.window.showInformationMessage("Indexing was cancelled");
        // We generally don't re-throw cancellations as errors to the UI
      } else {
        this.notifyProgress({
          current: 0,
          total: 0,
          status: "error",
        });
        this._logger.log("=".repeat(60));
        this._logger.log(
          "[INDEXING] ✗ Indexing failed with critical error",
          "ERROR"
        );

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        this._logger.log(`[INDEXING] Error: ${errorMessage}`, "ERROR");
        this._logger.log("=".repeat(60));

        vscode.window.showErrorMessage(`Indexing failed: ${errorMessage}`);

        // Re-throw the error so callers (e.g., WebviewController) can surface failure
        throw error;
      }
    } finally {
      this._isIndexing = false;
      this._cancellationTokenSource = undefined;

      // If we were cancelled but didn't throw (edge case), handle it here
      if (wasCancelled || token.isCancellationRequested) {
        this.notifyProgress({
          current: 0,
          total: 0,
          status: "cancelled",
        });
        this._logger.log("[INDEXING] ⚠ Indexing cancelled (cleanup)");
        vscode.window.showInformationMessage("Indexing was cancelled");
      }
    }
  }

  /**
   * Stop current indexing operation
   */
  public stopIndexing(): void {
    if (this._cancellationTokenSource) {
      this._cancellationTokenSource.cancel();
    }
  }

  /**
   * Check if indexing is currently in progress
   */
  public get isIndexing(): boolean {
    return this._isIndexing;
  }

  /**
   * Get collection statistics including vector count
   * @returns Collection stats or null if unavailable
   */
  public async getCollectionStats(): Promise<{ vectorCount: number } | null> {
    if (!this._client || !this._activeConfig) return null;

    const collectionName = this._activeConfig.index_info?.name || "codebase";

    try {
      const info = await this._client.getCollection(collectionName);
      return {
        vectorCount: info.points_count ?? 0,
      };
    } catch (e) {
      // Collection might not exist yet
      this._logger.log(`Failed to get stats: ${e}`, "WARN");
      return null;
    }
  }

  private getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return undefined;

    // Priority: 1. Folder with active text editor, 2. First folder
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document?.uri) {
      const activeFolder = folders.find((folder) =>
        activeEditor.document.uri.fsPath.startsWith(folder.uri.fsPath)
      );
      if (activeFolder) {
        return activeFolder;
      }
    }

    return folders[0];
  }

  private async ensureCollection(
    name: string,
    vectorSize: number,
    token?: vscode.CancellationToken
  ): Promise<void> {
    if (!this._vectorStore) {
      this._logger.log("[INDEXING] No vector store available", "ERROR");
      return;
    }

    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    this._logger.log(
      `[INDEXING] Ensuring collection '${name}' exists with vector size ${vectorSize}`
    );

    try {
      await this._vectorStore.ensureCollection(name, vectorSize, token);
      this._logger.log(`[INDEXING] Collection '${name}' is ready for indexing`);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.message === "Indexing cancelled") {
        this._logger.log(`[INDEXING] ensureCollection was cancelled`);
        throw error;
      }

      this._logger.log(
        `[INDEXING] Error ensuring collection '${name}':`,
        "ERROR"
      );
      throw e;
    }
  }

  /**
   * Indexes a guidance string (e.g., from clipboard).
   */
  public async indexGuidance(
    content: string,
    token?: vscode.CancellationToken
  ): Promise<string> {
    if (!this._activeConfig || !this._vectorStore) {
      // Attempt to auto-init if not ready (uses default workspace behavior)
      if (!(await this.initializeForSearch(this.getActiveWorkspaceFolder()!))) {
        throw new Error("Indexing Service not initialized.");
      }
    }

    // Double check initialization
    if (!this._activeConfig || !this._vectorStore) {
      throw new Error("Indexing Service initialization failed.");
    }

    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    const collectionName = this._activeConfig.index_info?.name || "codebase";
    const guidanceId = crypto.randomUUID();

    this._logger.log(
      `[INDEXING] Processing guidance item (${content.length} bytes)`
    );

    // Use custom splitting logic for guidance: 10% overlap
    const lines = content.split("\n");
    const CHUNK_SIZE = 50;
    const OVERLAP = Math.ceil(CHUNK_SIZE * 0.1); // 10% overlap -> 5 lines

    const chunks = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
      const end = Math.min(i + CHUNK_SIZE, lines.length);
      const chunkLines = lines.slice(i, end);
      const chunkText = chunkLines.join("\n").trim();

      if (chunkText.length > 0) {
        chunks.push({
          id: crypto.randomUUID(),
          content: chunkText,
          lineStart: i + 1,
          lineEnd: end,
        });
      }
    }

    const points: Array<{
      id: string;
      vector: number[];
      payload: {
        filePath: string;
        content: string;
        lineStart: number;
        lineEnd: number;
        type: "guidance";
        guidanceId: string;
        indexName?: string;
      };
    }> = [];

    for (const chunk of chunks) {
      if (token?.isCancellationRequested) throw new Error("Indexing cancelled");

      const vector = await this.generateEmbedding(chunk.content, token);
      if (vector) {
        points.push({
          id: chunk.id,
          vector: vector,
          payload: {
            filePath: "clipboard", // Special marker
            content: chunk.content,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            type: "guidance", // Explicitly typed as "guidance"
            guidanceId: guidanceId,
            indexName: collectionName,
          },
        });
      }
    }

    if (points.length > 0) {
      await this._vectorStore.upsertPoints(collectionName, points, token);
      this._logger.log(
        `[INDEXING] Indexed guidance item ${guidanceId} with ${points.length} chunks.`
      );
    }

    return guidanceId;
  }

  /**
   * Breaks file content into chunks, embeds them, and uploads to Qdrant
   */
  private async indexFile(
    collectionName: string,
    filePath: string,
    content: string,
    token: vscode.CancellationToken,
    repoId: string, // NEW
    commit: string // NEW
  ): Promise<void> {
    // Check for cancellation
    if (token.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    const fileStartTime = Date.now();
    this._logger.log(
      `[INDEXING] Processing file: ${filePath} (${content.length} bytes)`
    );

    // Use shared splitter logic
    const chunks = this._splitter.split(content, filePath);

    if (chunks.length === 0) {
      this._logger.log(
        `[INDEXING] No chunks generated for ${filePath}, skipping`
      );
      return;
    }

    this._logger.log(
      `[INDEXING] Split ${filePath} into ${chunks.length} chunks`
    );

    const points: Array<{
      id: string;
      vector: number[];
      payload: {
        filePath: string;
        content: string;
        lineStart: number;
        lineEnd: number;
        type: "file";
        // Add metadata
        repoId?: string;
        commit?: string;
        indexName?: string;
      };
    }> = [];
    let embeddingCount = 0;

    for (const chunk of chunks) {
      // Check for cancellation before each embedding
      if (token.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      const vector = await this.generateEmbedding(chunk.content, token);
      if (!vector) {
        this._logger.log(
          `[INDEXING] Failed to generate embedding for chunk in ${filePath}, skipping chunk`,
          "WARN"
        );
        continue;
      }

      embeddingCount++;
      points.push({
        id: chunk.id,
        vector: vector,
        payload: {
          filePath: chunk.filePath,
          content: chunk.content,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          type: "file", // Explicitly set type to "file"
          // Add metadata
          repoId: repoId,
          commit: commit,
          indexName: collectionName,
        },
      });
    }

    this._logger.log(
      `[INDEXING] Generated ${embeddingCount}/${chunks.length} embeddings for ${filePath}`
    );

    if (this._vectorStore && points.length > 0) {
      // Final cancellation check before network operation
      if (token.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      try {
        await this._vectorStore.upsertPoints(collectionName, points, token);
        const fileDuration = Date.now() - fileStartTime;
        this._logger.log(
          `[INDEXING] ✓ Completed ${filePath}: ${points.length} chunks indexed in ${fileDuration}ms`
        );
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));

        if (error.message === "Indexing cancelled") {
          this._logger.log(`[INDEXING] indexFile upsert was cancelled`);
          throw error;
        }

        this._logger.log(
          `[INDEXING] Upsert failed for ${points.length} points in ${filePath}:`,
          "ERROR"
        );
        throw e;
      }
    }
  }

  private async generateEmbedding(
    text: string,
    token?: vscode.CancellationToken
  ): Promise<number[] | null> {
    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    if (!this._embeddingProvider) {
      this._logger.log("[INDEXING] No embedding provider available", "ERROR");
      return null;
    }

    const startTime = Date.now();
    const textPreview =
      text.length > 100 ? text.substring(0, 100) + "..." : text;

    this._logger.log(
      `[INDEXING] Generating embedding via ${this._activeConfig?.active_embedding_provider} provider, text length: ${text.length}`
    );
    this._logger.log(`[INDEXING] Text preview: "${textPreview}"`);

    try {
      const embedding = await this._embeddingProvider.generateEmbedding(
        text,
        token
      );
      const totalDuration = Date.now() - startTime;

      if (embedding) {
        this._logger.log(
          `[INDEXING] Embedding generated successfully in ${totalDuration}ms, dimensions: ${embedding.length}`
        );
        return embedding;
      } else {
        this._logger.log(
          `[INDEXING] Embedding provider returned null after ${totalDuration}ms`,
          "WARN"
        );
        return null;
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      // Handle cancellation
      if (error.message === "Indexing cancelled") {
        this._logger.log(
          `[INDEXING] Embedding generation was cancelled after ${duration}ms`
        );
        throw error;
      }

      this._logger.log(
        `[INDEXING] Embedding generation failed after ${duration}ms:`,
        "ERROR"
      );

      // Special logging for network-related errors
      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this._logger.log(
          `[INDEXING] NETWORK ERROR in generateEmbedding - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
      }

      return null;
    }
  }

  /**
   * Detects embedding dimension using the active embedding provider
   * @param token Optional cancellation token
   * @returns The detected dimension or fallback to 768
   */
  private async detectEmbeddingDimension(
    token?: vscode.CancellationToken
  ): Promise<number> {
    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    if (!this._embeddingProvider) {
      this._logger.log(
        "[INDEXING] No embedding provider available, using fallback dimension 768",
        "WARN"
      );
      return 768;
    }

    this._logger.log("[INDEXING] Detecting embedding dimension...");

    try {
      const dimension = await this._embeddingProvider.getEmbeddingDimension(
        token
      );
      this._logger.log(`[INDEXING] Detected embedding dimension: ${dimension}`);
      return dimension;
    } catch {
      this._logger.log(
        "[INDEXING] Error detecting embedding dimension:",
        "ERROR"
      );
      this._logger.log(
        "[INDEXING] Using fallback dimension 768 due to detection failure",
        "WARN"
      );
      return 768;
    }
  }

  public async search(
    query: string,
    options?: { limit?: number; filter?: any }, // Added filter
    token?: vscode.CancellationToken
  ): Promise<SearchResultItem[]> {
    if (!this._vectorStore || !this._activeConfig) {
      this._logger.log(
        `[SEARCH] Cannot search - vector store initialized: ${!!this
          ._vectorStore}, active config: ${!!this._activeConfig}`
      );
      vscode.window.showErrorMessage(
        "Indexing service is not initialized. Cannot perform search."
      );
      return [];
    }

    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Search cancelled");
    }

    const collectionName = this._activeConfig.index_info?.name || "codebase";
    const startTime = Date.now();

    this._logger.log(
      `[SEARCH] Starting search for query: "${query}" in collection '${collectionName}'`
    );

    try {
      const embeddingStartTime = Date.now();
      const vector = await this.generateEmbedding(query, token);
      const embeddingDuration = Date.now() - embeddingStartTime;

      // Check for cancellation after embedding generation
      if (token?.isCancellationRequested) {
        throw new Error("Search cancelled");
      }

      if (!vector) {
        this._logger.log(
          `[SEARCH] Failed to generate embedding for query: "${query}"`
        );
        vscode.window.showWarningMessage(
          "Could not generate embedding for search query."
        );
        return [];
      }

      this._logger.log(
        `[SEARCH] Embedding generated in ${embeddingDuration}ms with ${vector.length} dimensions`
      );

      const searchLimit =
        options?.limit ?? this._configService.config.search.limit;
      const searchStartTime = Date.now();
      this._logger.log(
        `[SEARCH] Executing vector search with limit ${searchLimit}`
      );

      // Build the indexName filter condition
      const indexNameCondition = {
        key: "indexName",
        match: { value: collectionName },
      };

      // Normalize and merge must conditions
      const baseFilter = options?.filter ?? {};
      const mustFromBase = Array.isArray(baseFilter.must)
        ? baseFilter.must
        : baseFilter.must
        ? [baseFilter.must]
        : [];

      const mergedFilter = {
        ...baseFilter,
        must: [indexNameCondition, ...mustFromBase],
      };

      this._logger.log(`[SEARCH] Applied indexName filter: ${collectionName}`);

      // Pass merged filter to vector store (assumes vector store supports it, which Qdrant does)
      const results = await this._vectorStore.search(
        collectionName,
        vector,
        searchLimit,
        token,
        mergedFilter
      );

      const searchDuration = Date.now() - searchStartTime;
      this._logger.log(
        `[SEARCH] Vector search completed in ${searchDuration}ms`
      );

      const totalDuration = Date.now() - startTime;
      this._logger.log(
        `[SEARCH] Search completed successfully in ${totalDuration}ms, found ${results.length} results`
      );

      return results.map(
        (item): SearchResultItem => ({
          id: item.id,
          score: item.score,
          payload: item.payload,
        })
      );
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      // Handle AbortError specifically
      if (error.name === "AbortError") {
        this._logger.log(`[SEARCH] Search was aborted after ${duration}ms`);
        throw new Error("Search cancelled");
      }

      this._logger.log(
        `[SEARCH] Search failed in collection ${collectionName} after ${duration}ms:`,
        "ERROR"
      );

      // Special logging for network-related errors
      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this._logger.log(
          `[SEARCH] NETWORK ERROR in search - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
        this._logger.log(`[SEARCH] Network error details:`, "FATAL");
      }

      vscode.window.showErrorMessage(`Search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get or create a Qdrant client from the connection pool
   */
  private getOrCreateClient(url: string, apiKey?: string): QdrantClient {
    const clientKey = `${url}:${apiKey || ""}`;

    // Check if we already have a client for this configuration
    if (this._connectionPool.has(clientKey)) {
      this._logger.log(`[INDEXING] Reusing existing Qdrant client from pool`);
      return this._connectionPool.get(clientKey)!;
    }

    // FIX: Pass undefined if apiKey is empty string to prevent auth errors with some clients
    const client = new QdrantClient({
      url,
      apiKey: apiKey || undefined,
    });

    // Add to pool if space available
    if (this._connectionPool.size < this._maxPoolSize) {
      this._connectionPool.set(clientKey, client);
      this._logger.log(
        `[INDEXING] Added new Qdrant client to pool (size: ${this._connectionPool.size})`
      );
    } else {
      // Pool is full, remove oldest client
      const firstKey = this._connectionPool.keys().next().value;
      if (firstKey) {
        this._connectionPool.delete(firstKey);
        this._logger.log(
          `[INDEXING] Removed oldest Qdrant client from pool (size: ${this._connectionPool.size})`
        );
      }
      this._connectionPool.set(clientKey, client);
      this._logger.log(
        `[INDEXING] Added new Qdrant client to pool (replaced oldest)`
      );
    }

    return client;
  }

  /**
   * Retry helper with exponential backoff for transient network failures
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === maxAttempts;

        if (isLastAttempt) {
          throw error;
        }

        // Check if this is a transient network error that should be retried
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTransientError =
          errorMsg.includes("ECONNRESET") ||
          errorMsg.includes("connection reset") ||
          errorMsg.includes("network") ||
          errorMsg.includes("fetch") ||
          errorMsg.includes("timeout");

        if (!isTransientError) {
          // Non-transient error, don't retry
          throw error;
        }

        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this._logger.log(
          `[INDEXING] Retry attempt ${
            attempt + 1
          } after ${delay}ms due to: ${errorMsg}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  public dispose(): void {
    this.stopIndexing();
    this._progressListeners = [];

    // Clean up connection pool
    for (const [key] of this._connectionPool.entries()) {
      try {
        // Note: QdrantClient doesn't have a dispose method, but we clean up references
        this._logger.log(
          `[INDEXING] Cleaning up connection pool client: ${key}`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this._logger.log(
          `[INDEXING] Error cleaning up pool client: ${errorMsg}`,
          "ERROR"
        );
      }
    }

    this._connectionPool.clear();
    this._logger.log(`[INDEXING] Connection pool cleared`);
  }
}
