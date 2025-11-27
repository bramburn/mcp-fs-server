import { QdrantClient } from "@qdrant/js-client-rest";
import * as vscode from "vscode";
import { QdrantOllamaConfig } from "../webviews/protocol.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { ConfigService } from "./ConfigService.js";
import { ILogger } from "./LoggerService.js";
// Use a relative import so compiled extension can resolve this at runtime
// when packaged and installed in VS Code. The previous bare "shared" import
// relied on TS path aliases and failed in extension host.
import { CodeSplitter } from "../shared/code-splitter.js";

interface SearchResultItem {
  id: string | number;
  score: number;
  payload: {
    filePath: string;
    content: string;
    lineStart: number;
    lineEnd: number;
  };
}

/**
 * Indexing progress information
 */
export interface IndexingProgress {
  current: number;
  total: number;
  currentFile?: string;
  status: "starting" | "indexing" | "completed" | "error" | "cancelled";
}

export type IndexingProgressListener = (progress: IndexingProgress) => void;

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
  
  // Connection pool management for reusing existing connections
  private _connectionPool: Map<string, QdrantClient> = new Map();
  private _maxPoolSize = 5; // Maximum number of connections to keep in pool

  constructor(
    private readonly _configService: ConfigService,
    private readonly _context: vscode.ExtensionContext,
    private readonly _analyticsService: AnalyticsService,
    private readonly _logger: ILogger
  ) {
    this._splitter = new CodeSplitter();
  }

  /**
   * Add a listener for indexing progress
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
    } catch (e) {
      this._logger.log(
        "Failed to init splitter WASM (falling back to line split)",
        "WARN"
      );
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
      this.notifyProgress({
        current: 0,
        total: 0,
        status: "starting",
      });

      // Get active workspace folder if not provided
      const workspaceFolder = folder || this.getActiveWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error("No active workspace folder found");
      }

      const config = await this._configService.loadQdrantConfig(
        workspaceFolder
      );
      if (!config) {
        throw new Error(
          `No valid configuration found in ${workspaceFolder.name}. Please create .qdrant/configuration.json`
        );
      }

      // Validate connections before starting heavy work with retry logic
      const connectionStartTime = Date.now();
      const isHealthy = await this.retryWithBackoff(
        () => this._configService.validateConnection(config),
        3, // Max retries for connection validation
        1000 // 1 second delay
      );
      const connectionDuration = Date.now() - connectionStartTime;

      if (isHealthy) {
        this._analyticsService.trackEvent("connection_success", {
          connectionDuration,
          qdrantUrl: config.qdrant_config.url,
          ollamaUrl: config.ollama_config.base_url,
        });
      } else {
        this._analyticsService.trackEvent("connection_failed", {
          connectionDuration,
          qdrantUrl: config.qdrant_config.url,
          ollamaUrl: config.ollama_config.base_url,
        });
        throw new Error(
          "Could not connect to Qdrant or Ollama. Check your configuration and ensure services are running."
        );
      }

      this._activeConfig = config;
      
      // Use connection pool management
      this._client = this.getOrCreateClient(config.qdrant_config.url, config.qdrant_config.api_key);
      
      this._logger.log(
        `[INDEXING] Qdrant client initialized successfully (using connection pool)`
      );

      // Initialize Splitter with WASM paths
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
      } catch (e) {
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

      const files = await vscode.workspace.findFiles(
        includePattern,
        excludePattern,
        configSettings.indexing.maxFiles
      );

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

      for (const fileUri of files) {
        // Check for cancellation before each file
        if (token.isCancellationRequested) {
          wasCancelled = true;
          throw new Error("Indexing cancelled");
        }

        try {
          const content = await vscode.workspace.fs.readFile(fileUri);
          const text = new TextDecoder().decode(content);
          const relativePath = vscode.workspace.asRelativePath(fileUri);

          await this.indexFile(collectionName, relativePath, text, token);
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
            throw err;
          }
          if (token.isCancellationRequested) {
            wasCancelled = true;
            throw new Error("Indexing cancelled");
          }
          this._logger.log(`Failed to index file ${fileUri.fsPath}:`, "ERROR");
        }
      }

      // Only show success message if not cancelled
      if (!wasCancelled && !token.isCancellationRequested) {
        this.notifyProgress({
          current: processedCount,
          total: files.length,
          status: "completed",
        });

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
        vscode.window.showInformationMessage("Indexing was cancelled");
        // We generally don't re-throw cancellations as errors to the UI
      } else {
        this.notifyProgress({
          current: 0,
          total: 0,
          status: "error",
        });
        this._logger.log("Indexing critical failure:", "ERROR");

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
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
    if (!this._client) return;

    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    const startTime = Date.now();
    this._logger.log(`[INDEXING] Checking if collection '${name}' exists`);

    try {
      // Create AbortController for Qdrant operations
      const controller = new AbortController();

      // Connect CancellationToken to AbortController
      if (token) {
        token.onCancellationRequested(() => {
          this._logger.log(`[INDEXING] ensureCollection cancelled via token`);
          controller.abort(); // !AI: Future - Ensure controller.abort() is called with the signal if QdrantClient supports it, or verify this is sufficient for cancellation.
        });
      }

      const collections = await this._client.getCollections();
      const getCollectionsDuration = Date.now() - startTime;
      this._logger.log(
        `[INDEXING] getCollections completed in ${getCollectionsDuration}ms, found ${collections.collections.length} collections`
      );

      // Check for cancellation after getCollections
      if (token?.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      const exists = collections.collections.some((c) => c.name === name);
      this._logger.log(`[INDEXING] Collection '${name}' exists: ${exists}`);

      if (!exists) {
        // Check for cancellation again
        if (token?.isCancellationRequested) {
          throw new Error("Indexing cancelled");
        }

        const createStartTime = Date.now();
        this._logger.log(
          `[INDEXING] Creating collection '${name}' with vector size ${vectorSize}`
        );
        await this._client.createCollection(name, {
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
        });
        const createDuration = Date.now() - createStartTime;
        this._logger.log(
          `[INDEXING] Collection '${name}' created successfully in ${createDuration}ms`
        );
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      // Handle AbortError specifically
      if (error.name === "AbortError") {
        this._logger.log(
          `[INDEXING] ensureCollection was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this._logger.log(`[INDEXING] Error checking/creating collection '${name}' after ${duration}ms:`, "ERROR");

      // Special logging for network-related errors
      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this._logger.log(
          `[INDEXING] NETWORK ERROR in ensureCollection - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
        this._logger.log(`[INDEXING] Network error details:`, "FATAL");
      }

      throw e;
    }
  }

  /**
   * Breaks file content into chunks, embeds them, and uploads to Qdrant
   */
  private async indexFile(
    collectionName: string,
    filePath: string,
    content: string,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Check for cancellation
    if (token.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    // Use shared splitter logic
    const chunks = this._splitter.split(content, filePath);

    if (chunks.length === 0) return;

    const points = [];

    for (const chunk of chunks) {
      // Check for cancellation before each embedding
      if (token.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      const vector = await this.generateEmbedding(chunk.content, token);
      if (!vector) continue;

      points.push({
        id: chunk.id,
        vector: vector,
        payload: {
          filePath: chunk.filePath,
          content: chunk.content,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
        },
      });
    }

    if (this._client && points.length > 0) {
      // Final cancellation check before network operation
      if (token.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      const startTime = Date.now();
      this._logger.log(
        `[INDEXING] Upserting ${points.length} points to collection '${collectionName}'`
      );

      try {
        // Create AbortController for Qdrant operations
        const controller = new AbortController();

        // Connect CancellationToken to AbortController
        token.onCancellationRequested(() => {
          this._logger.log(`[INDEXING] indexFile upsert cancelled via token`);
          controller.abort(); // !AI: Ensure controller.abort() is passed to the underlying QdrantClient call if it supports AbortSignal.
        });

        await this._client.upsert(collectionName, {
          points: points,
          // Note: QdrantClient may not support AbortSignal directly
          // We handle cancellation through our token checks and AbortController
        });
        const duration = Date.now() - startTime;
        this._logger.log(
          `[INDEXING] Upsert completed successfully in ${duration}ms for ${points.length} points`
        );
      } catch (e) {
        const duration = Date.now() - startTime;
        const error = e instanceof Error ? e : new Error(String(e));

        // Handle AbortError specifically
        if (error.name === "AbortError") {
          this._logger.log(
            `[INDEXING] indexFile upsert was aborted after ${duration}ms`
          );
          throw new Error("Indexing cancelled");
        }

        this._logger.log(`[INDEXING] Upsert failed after ${duration}ms for ${points.length} points:`, "ERROR");

        // Special logging for network-related errors
        if (
          error.message.includes("ECONNRESET") ||
          error.message.includes("connection reset") ||
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          this._logger.log(
            `[INDEXING] NETWORK ERROR in upsert - Type: ${error.name}, Message: ${error.message}`,
            "FATAL"
          );
          this._logger.log(`[INDEXING] Network error details:`, "FATAL");
        }

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

    if (!this._activeConfig) return null;

    const { base_url, model } = this._activeConfig.ollama_config;
    const startTime = Date.now();
    const textPreview =
      text.length > 100 ? text.substring(0, 100) + "..." : text;

    this._logger.log(
      `[INDEXING] Generating embedding with model '${model}' from ${base_url}, text length: ${text.length}`
    );
    this._logger.log(`[INDEXING] Text preview: "${textPreview}"`);

    try {
      // Use retry logic for transient network failures
      const response = await this.retryWithBackoff(
        async () => {
          // Create AbortController for fetch cancellation
          const controller = new AbortController();

          // Connect CancellationToken to AbortController
          if (token) {
            token.onCancellationRequested(() => {
              this._logger.log(`[INDEXING] Embedding generation cancelled via token`);
              controller.abort();
            });
          }

          const fetchStartTime = Date.now();
          const fetchResponse = await fetch(`${base_url}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model,
              prompt: text,
            }),
            signal: controller.signal,
          });
          const fetchDuration = Date.now() - fetchStartTime;
          this._logger.log(
            `[INDEXING] Ollama fetch completed in ${fetchDuration}ms, status: ${fetchResponse.status}, ok: ${fetchResponse.ok}`
          );

          if (!fetchResponse.ok) {
            const errorText = await fetchResponse
              .text()
              .catch(() => "Unable to read error response");
            this._logger.log(
              `[INDEXING] Ollama embedding failed - Status: ${fetchResponse.status}, Response: ${errorText}`,
              "ERROR"
            );
            throw new Error(
              `Ollama Error: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`
            );
          }

          return fetchResponse;
        },
        2, // Max retries for embedding generation
        500 // 500ms delay
      );
      
      const parseStartTime = Date.now();
      const data = (await response.json()) as { embedding: number[] };
      const parseDuration = Date.now() - parseStartTime;
      const totalDuration = Date.now() - startTime;

      this._logger.log(
        `[INDEXING] Embedding generated successfully - parse: ${parseDuration}ms, total: ${totalDuration}ms, dimensions: ${data.embedding.length}`
      );
      return data.embedding;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      // Handle AbortError specifically
      if (error.name === "AbortError") {
        this._logger.log(
          `[INDEXING] Embedding generation was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
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
        this._logger.log(`[INDEXING] Network error details:`, "FATAL");
      }

      return null;
    }
  }

  /**
   * Detects embedding dimension by generating a test embedding
   * @param token Optional cancellation token
   * @returns The detected dimension or fallback to 768
   */
  private async detectEmbeddingDimension(
    token?: vscode.CancellationToken
  ): Promise<number> {
    // Check for cancellation
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled"); // !AI: Cancellation check is good, but the hardcoded fallback dimension is brittle.
    }

    if (!this._activeConfig) {
      this._logger.log(
        "[INDEXING] No active config available, using fallback dimension 768",
        "WARN"
      ); // !AI: Hardcoded fallback dimension (768) is architecturally unsound. Should default to the dimension of the default Ollama model or be configurable.
      return 768;
    }

    this._logger.log("[INDEXING] Detecting embedding dimension...");

    try {
      // Generate a test embedding with a simple text
      const testText = "dimension detection test";
      const testEmbedding = await this.generateEmbedding(testText, token);

      if (testEmbedding && testEmbedding.length > 0) {
        const dimension = testEmbedding.length;
        this._logger.log(`[INDEXING] Detected embedding dimension: ${dimension}`);
        return dimension;
      } else {
        this._logger.log(
          "[INDEXING] Failed to generate test embedding, using fallback dimension 768",
          "WARN"
        );
        return 768;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this._logger.log("[INDEXING] Error detecting embedding dimension:", "ERROR");
      this._logger.log(
        "[INDEXING] Using fallback dimension 768 due to detection failure",
        "WARN"
      );
      return 768;
    }
  }

  public async search(
    query: string,
    token?: vscode.CancellationToken
  ): Promise<SearchResultItem[]> {
    if (!this._client || !this._activeConfig) {
      this._logger.log(
        `[SEARCH] Cannot search - client initialized: ${!!this
          ._client}, active config: ${!!this._activeConfig}`
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

      const searchLimit = this._configService.config.search.limit;
      const searchStartTime = Date.now();
      this._logger.log(`[SEARCH] Executing vector search with limit ${searchLimit}`);

      // Create AbortController for Qdrant search operation
      const controller = new AbortController();

      // Connect CancellationToken to AbortController
      if (token) {
        token.onCancellationRequested(() => {
          this._logger.log(`[SEARCH] Vector search cancelled via token`);
          controller.abort(); // !AI: Ensure controller.abort() is passed to the underlying QdrantClient call if it supports AbortSignal.
        });
      }

      const searchResult = await this._client.search(collectionName, {
        vector: vector,
        limit: searchLimit,
        // Note: QdrantClient may not support AbortSignal directly
        // We handle cancellation through our token checks and AbortController
      });

      const searchDuration = Date.now() - searchStartTime;
      this._logger.log(`[SEARCH] Vector search completed in ${searchDuration}ms`);

      // The search result contains hits with payload.
      // Cast to expected structure which may have 'points' or 'hits' property.
      const qdrantResult = searchResult as {
        points?: {
          id: string | number;
          score: number;
          payload: SearchResultItem["payload"];
        }[];
        hits?: {
          id: string | number;
          score: number;
          payload: SearchResultItem["payload"];
        }[];
      };
      const results = qdrantResult.points || qdrantResult.hits || [];

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

      this._logger.log(`[SEARCH] Search failed in collection ${collectionName} after ${duration}ms:`, "ERROR");

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
    const clientKey = `${url}:${apiKey || ''}`;
    
    // Check if we already have a client for this configuration
    if (this._connectionPool.has(clientKey)) {
      this._logger.log(`[INDEXING] Reusing existing Qdrant client from pool`);
      return this._connectionPool.get(clientKey)!;
    }
    
    // Create new client if not in pool
    const client = new QdrantClient({
      url,
      apiKey,
    });
    
    // Add to pool if space available
    if (this._connectionPool.size < this._maxPoolSize) {
      this._connectionPool.set(clientKey, client);
      this._logger.log(`[INDEXING] Added new Qdrant client to pool (size: ${this._connectionPool.size})`);
    } else {
      // Pool is full, remove oldest client
      const firstKey = this._connectionPool.keys().next().value;
      if (firstKey) {
        const oldClient = this._connectionPool.get(firstKey);
        this._connectionPool.delete(firstKey);
        this._logger.log(`[INDEXING] Removed oldest Qdrant client from pool (size: ${this._connectionPool.size})`);
      }
      this._connectionPool.set(clientKey, client);
      this._logger.log(`[INDEXING] Added new Qdrant client to pool (replaced oldest)`);
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
        this._logger.log(`[INDEXING] Retry attempt ${attempt + 1} after ${delay}ms due to: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  public dispose(): void {
    this.stopIndexing();
    this._progressListeners = [];
    
    // Clean up connection pool
    for (const [key, client] of this._connectionPool.entries()) {
      try {
        // Note: QdrantClient doesn't have a dispose method, but we clean up references
        this._logger.log(`[INDEXING] Cleaning up connection pool client: ${key}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this._logger.log(`[INDEXING] Error cleaning up pool client: ${errorMsg}`, "ERROR");
      }
    }
    
    this._connectionPool.clear();
    this._logger.log(`[INDEXING] Connection pool cleared`);
  }
}