import * as vscode from 'vscode';
import { ConfigService } from './ConfigService.js';
import { AnalyticsService } from './AnalyticsService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { QdrantClient } from '@qdrant/js-client-rest';
// Use a relative import so the compiled extension can resolve this at runtime
// when packaged and installed in VS Code. The previous bare "shared" import
// relied on TS path aliases and failed in the extension host.
import { CodeSplitter } from '../shared/code-splitter.js';

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
    status: 'starting' | 'indexing' | 'completed' | 'error' | 'cancelled';
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

    constructor(
        private readonly _configService: ConfigService,
        private readonly _context: vscode.ExtensionContext,
        private readonly _analyticsService: AnalyticsService
    ) {
        this._splitter = new CodeSplitter();
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
        this._progressListeners.forEach(listener => {
            try {
                listener(progress);
            } catch (error) {
                console.error('Error in progress listener:', error);
            }
        });
    }

    /**
     * Triggers the indexing process for the given workspace folder with cancellation support
     */
    public async startIndexing(folder?: vscode.WorkspaceFolder): Promise<void> {
        if (this._isIndexing) {
            vscode.window.showWarningMessage('Indexing is already in progress.');
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
                status: 'starting'
            });

            // Get active workspace folder if not provided
            const workspaceFolder = folder || this.getActiveWorkspaceFolder();
            if (!workspaceFolder) {
                throw new Error('No active workspace folder found');
            }

            const config = await this._configService.loadQdrantConfig(workspaceFolder);
            if (!config) {
                throw new Error(`No valid configuration found in ${workspaceFolder.name}. Please create .qdrant/configuration.json`);
            }
            
            // Validate connections before starting heavy work
            const connectionStartTime = Date.now();
            const isHealthy = await this._configService.validateConnection(config);
            const connectionDuration = Date.now() - connectionStartTime;

            if (isHealthy) {
                this._analyticsService.trackEvent('connection_success', {
                    connectionDuration,
                    qdrantUrl: config.qdrant_config.url,
                    ollamaUrl: config.ollama_config.base_url
                });
            } else {
                this._analyticsService.trackEvent('connection_failed', {
                    connectionDuration,
                    qdrantUrl: config.qdrant_config.url,
                    ollamaUrl: config.ollama_config.base_url
                });
                throw new Error('Could not connect to Qdrant or Ollama. Check your configuration and ensure services are running.');
            }

            this._activeConfig = config;
            console.log(`[INDEXING] Initializing Qdrant client with URL: ${config.qdrant_config.url}`);
            try {
                this._client = new QdrantClient({
                    url: config.qdrant_config.url,
                    apiKey: config.qdrant_config.api_key,
                });
                console.log(`[INDEXING] Qdrant client initialized successfully`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                console.error(`[INDEXING] Failed to initialize Qdrant client:`, {
                    message: err.message,
                    stack: err.stack,
                    name: err.name,
                    url: config.qdrant_config.url,
                    hasApiKey: !!config.qdrant_config.api_key
                });
                throw err;
            }

            // Initialize Splitter with WASM paths
            try {
                const wasmPath = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'tree-sitter.wasm').fsPath;
                const langPath = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'tree-sitter-typescript.wasm').fsPath;
                await this._splitter.initialize(wasmPath, langPath);
            } catch (e) {
                console.warn('Failed to init splitter WASM (falling back to line split):', e);
            }

            vscode.window.setStatusBarMessage('$(sync~spin) Qdrant: Indexing...', 3000);

            const collectionName = config.index_info?.name || 'codebase';
            
            // Detect embedding dimension dynamically
            const vectorDimension = await this.detectEmbeddingDimension(token);
            console.log(`[INDEXING] Using detected vector dimension: ${vectorDimension}`);
            
            // Ensure Collection Exists with dynamic dimension
            await this.ensureCollection(collectionName, vectorDimension, token);

            // Find files using configuration
            const configSettings = this._configService.config;
            const excludePattern = configSettings.indexing.excludePatterns.length > 0
                ? new vscode.RelativePattern(workspaceFolder, `{${configSettings.indexing.excludePatterns.join(',')}}`)
                : undefined;

            const includePattern = configSettings.indexing.includeExtensions.length > 0
                ? new vscode.RelativePattern(workspaceFolder, `**/*.{${configSettings.indexing.includeExtensions.join(',')}}`)
                : new vscode.RelativePattern(workspaceFolder, '**/*');

            const files = await vscode.workspace.findFiles(
                includePattern,
                excludePattern,
                configSettings.indexing.maxFiles
            );

            // Check for cancellation before starting heavy work
            if (token.isCancellationRequested) {
                throw new Error('Indexing cancelled');
            }

            this.notifyProgress({
                current: 0,
                total: files.length,
                status: 'indexing'
            });

            let processedCount = 0;
            
            for (const fileUri of files) {
                // Check for cancellation before each file
                if (token.isCancellationRequested) {
                    wasCancelled = true;
                    throw new Error('Indexing cancelled');
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
                        status: 'indexing'
                    });

                } catch (err) {
                    // Enhanced error handling for both cancellation and other errors
                    if (err instanceof Error && err.message === 'Indexing cancelled') {
                        wasCancelled = true;
                        throw err;
                    }
                    if (token.isCancellationRequested) {
                        wasCancelled = true;
                        throw new Error('Indexing cancelled');
                    }
                    console.error(`Failed to index file ${fileUri.fsPath}:`, err);
                }
            }

            // Only show success message if not cancelled
            if (!wasCancelled && !token.isCancellationRequested) {
                this.notifyProgress({
                    current: processedCount,
                    total: files.length,
                    status: 'completed'
                });

                vscode.window.showInformationMessage(`Indexed ${processedCount} files successfully to collection '${collectionName}'.`);
            }

        } catch (error) {
            if (error instanceof Error && error.message === 'Indexing cancelled') {
                this.notifyProgress({
                    current: 0,
                    total: 0,
                    status: 'cancelled'
                });
                vscode.window.showInformationMessage('Indexing was cancelled');
            } else {
                this.notifyProgress({
                    current: 0,
                    total: 0,
                    status: 'error'
                });
                console.error('Indexing critical failure:', error);
                vscode.window.showErrorMessage(`Indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        } finally {
            this._isIndexing = false;
            this._cancellationTokenSource = undefined;
            
            // If we were cancelled but didn't throw (edge case), handle it here
            if (wasCancelled || token.isCancellationRequested) {
                this.notifyProgress({
                    current: 0,
                    total: 0,
                    status: 'cancelled'
                });
                vscode.window.showInformationMessage('Indexing was cancelled');
            }
        }
    }

    /**
     * Stop the current indexing operation
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
            const activeFolder = folders.find(folder => 
                activeEditor.document.uri.fsPath.startsWith(folder.uri.fsPath)
            );
            if (activeFolder) {
                return activeFolder;
            }
        }

        return folders[0];
    }

    private async ensureCollection(name: string, vectorSize: number, token?: vscode.CancellationToken): Promise<void> {
        if (!this._client) return;
        
        // Check for cancellation
        if (token?.isCancellationRequested) {
            throw new Error('Indexing cancelled');
        }
        
        const startTime = Date.now();
        console.log(`[INDEXING] Checking if collection '${name}' exists`);
        
        try {
            // Create AbortController for Qdrant operations
            const controller = new AbortController();
            
            // Connect CancellationToken to AbortController
            if (token) {
                token.onCancellationRequested(() => {
                    console.log(`[INDEXING] ensureCollection cancelled via token`);
                    controller.abort();
                });
            }

            const collections = await this._client.getCollections({
                // Note: QdrantClient may not support AbortSignal directly in all methods
                // We'll handle cancellation through our token checks
            });
            const getCollectionsDuration = Date.now() - startTime;
            console.log(`[INDEXING] getCollections completed in ${getCollectionsDuration}ms, found ${collections.collections.length} collections`);
            
            // Check for cancellation after getCollections
            if (token?.isCancellationRequested) {
                throw new Error('Indexing cancelled');
            }
            
            const exists = collections.collections.some(c => c.name === name);
            console.log(`[INDEXING] Collection '${name}' exists: ${exists}`);
            
            if (!exists) {
                // Check for cancellation again
                if (token?.isCancellationRequested) {
                    throw new Error('Indexing cancelled');
                }
                
                const createStartTime = Date.now();
                console.log(`[INDEXING] Creating collection '${name}' with vector size ${vectorSize}`);
                await this._client.createCollection(name, {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    },
                });
                const createDuration = Date.now() - createStartTime;
                console.log(`[INDEXING] Collection '${name}' created successfully in ${createDuration}ms`);
            }
        } catch (e) {
            const duration = Date.now() - startTime;
            const error = e instanceof Error ? e : new Error(String(e));
            
            // Handle AbortError specifically
            if (error.name === 'AbortError') {
                console.log(`[INDEXING] ensureCollection was aborted after ${duration}ms`);
                throw new Error('Indexing cancelled');
            }
            
            console.error(`[INDEXING] Error checking/creating collection '${name}' after ${duration}ms:`, {
                message: error.message,
                stack: error.stack,
                name: error.name,
                collectionName: name,
                vectorSize
            });
            
            // Special logging for network-related errors
            if (error.message.includes('ECONNRESET') || error.message.includes('connection reset') ||
                error.message.includes('network') || error.message.includes('fetch')) {
                console.error(`[INDEXING] NETWORK ERROR in ensureCollection - Type: ${error.name}, Message: ${error.message}`);
                console.error(`[INDEXING] Network error details:`, {
                    collectionName: name,
                    qdrantUrl: this._activeConfig?.qdrant_config.url,
                    timestamp: new Date().toISOString(),
                    duration
                });
            }
            
            throw e;
        }
    }

    /**
     * Breaks file content into chunks, embeds them, and uploads to Qdrant
     */
    private async indexFile(collectionName: string, filePath: string, content: string, token: vscode.CancellationToken): Promise<void> {
        // Check for cancellation
        if (token.isCancellationRequested) {
            throw new Error('Indexing cancelled');
        }

        // Use the shared splitter logic
        const chunks = this._splitter.split(content, filePath);
        
        if (chunks.length === 0) return;

        const points = [];

        for (const chunk of chunks) {
            // Check for cancellation before each embedding
            if (token.isCancellationRequested) {
                throw new Error('Indexing cancelled');
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
                    lineEnd: chunk.lineEnd
                }
            });
        }

        if (this._client && points.length > 0) {
            // Final cancellation check before network operation
            if (token.isCancellationRequested) {
                throw new Error('Indexing cancelled');
            }
            
            const startTime = Date.now();
            console.log(`[INDEXING] Upserting ${points.length} points to collection '${collectionName}'`);
            
            try {
                // Create AbortController for Qdrant operations
                const controller = new AbortController();
                
                // Connect CancellationToken to AbortController
                token.onCancellationRequested(() => {
                    console.log(`[INDEXING] indexFile upsert cancelled via token`);
                    controller.abort();
                });

                await this._client.upsert(collectionName, {
                    points: points
                    // Note: QdrantClient may not support AbortSignal directly
                    // We handle cancellation through our token checks and AbortController
                });
                const duration = Date.now() - startTime;
                console.log(`[INDEXING] Upsert completed successfully in ${duration}ms for ${points.length} points`);
            } catch (e) {
                const duration = Date.now() - startTime;
                const error = e instanceof Error ? e : new Error(String(e));
                
                // Handle AbortError specifically
                if (error.name === 'AbortError') {
                    console.log(`[INDEXING] indexFile upsert was aborted after ${duration}ms`);
                    throw new Error('Indexing cancelled');
                }
                
                console.error(`[INDEXING] Upsert failed after ${duration}ms for ${points.length} points:`, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    collectionName,
                    pointsCount: points.length
                });
                
                // Special logging for network-related errors
                if (error.message.includes('ECONNRESET') || error.message.includes('connection reset') ||
                    error.message.includes('network') || error.message.includes('fetch')) {
                    console.error(`[INDEXING] NETWORK ERROR in upsert - Type: ${error.name}, Message: ${error.message}`);
                    console.error(`[INDEXING] Network error details:`, {
                        collectionName,
                        qdrantUrl: this._activeConfig?.qdrant_config.url,
                        pointsCount: points.length,
                        timestamp: new Date().toISOString(),
                        duration
                    });
                }
                
                throw e;
            }
        }
    }

    private async generateEmbedding(text: string, token?: vscode.CancellationToken): Promise<number[] | null> {
        // Check for cancellation
        if (token?.isCancellationRequested) {
            throw new Error('Indexing cancelled');
        }

        if (!this._activeConfig) return null;

        const { base_url, model } = this._activeConfig.ollama_config;
        const startTime = Date.now();
        const textPreview = text.length > 100 ? text.substring(0, 100) + '...' : text;
        
        console.log(`[INDEXING] Generating embedding with model '${model}' from ${base_url}, text length: ${text.length}`);
        console.log(`[INDEXING] Text preview: "${textPreview}"`);

        try {
            // Create AbortController for fetch cancellation
            const controller = new AbortController();
            
            // Connect CancellationToken to AbortController
            if (token) {
                token.onCancellationRequested(() => {
                    console.log(`[INDEXING] Embedding generation cancelled via token`);
                    controller.abort();
                });
            }

            const fetchStartTime = Date.now();
            const response = await fetch(`${base_url}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: text
                }),
                signal: controller.signal
            });
            const fetchDuration = Date.now() - fetchStartTime;
            console.log(`[INDEXING] Ollama fetch completed in ${fetchDuration}ms, status: ${response.status}, ok: ${response.ok}`);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unable to read error response');
                console.error(`[INDEXING] Ollama embedding failed - Status: ${response.status}, Response: ${errorText}`);
                throw new Error(`Ollama Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const parseStartTime = Date.now();
            const data = await response.json() as { embedding: number[] };
            const parseDuration = Date.now() - parseStartTime;
            const totalDuration = Date.now() - startTime;
            
            console.log(`[INDEXING] Embedding generated successfully - parse: ${parseDuration}ms, total: ${totalDuration}ms, dimensions: ${data.embedding.length}`);
            return data.embedding;
        } catch (e) {
            const duration = Date.now() - startTime;
            const error = e instanceof Error ? e : new Error(String(e));
            
            // Handle AbortError specifically
            if (error.name === 'AbortError') {
                console.log(`[INDEXING] Embedding generation was aborted after ${duration}ms`);
                throw new Error('Indexing cancelled');
            }
            
            console.error(`[INDEXING] Embedding generation failed after ${duration}ms:`, {
                message: error.message,
                stack: error.stack,
                name: error.name,
                model,
                baseUrl: base_url,
                textLength: text.length,
                textPreview
            });
            
            // Special logging for network-related errors
            if (error.message.includes('ECONNRESET') || error.message.includes('connection reset') ||
                error.message.includes('network') || error.message.includes('fetch')) {
                console.error(`[INDEXING] NETWORK ERROR in generateEmbedding - Type: ${error.name}, Message: ${error.message}`);
                console.error(`[INDEXING] Network error details:`, {
                    model,
                    ollamaUrl: base_url,
                    textLength: text.length,
                    timestamp: new Date().toISOString(),
                    duration
                });
            }
            
            return null;
        }
    }

    /**
     * Detects the embedding dimension by generating a test embedding
     * @param token Optional cancellation token
     * @returns The detected dimension or fallback to 768
     */
    private async detectEmbeddingDimension(token?: vscode.CancellationToken): Promise<number> {
        // Check for cancellation
        if (token?.isCancellationRequested) {
            throw new Error('Indexing cancelled');
        }

        if (!this._activeConfig) {
            console.warn('[INDEXING] No active config available, using fallback dimension 768');
            return 768;
        }

        console.log('[INDEXING] Detecting embedding dimension...');
        
        try {
            // Generate a test embedding with a simple text
            const testText = "dimension detection test";
            const testEmbedding = await this.generateEmbedding(testText, token);
            
            if (testEmbedding && testEmbedding.length > 0) {
                const dimension = testEmbedding.length;
                console.log(`[INDEXING] Detected embedding dimension: ${dimension}`);
                return dimension;
            } else {
                console.warn('[INDEXING] Failed to generate test embedding, using fallback dimension 768');
                return 768;
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[INDEXING] Error detecting embedding dimension:', {
                message: err.message,
                model: this._activeConfig.ollama_config.model,
                baseUrl: this._activeConfig.ollama_config.base_url
            });
            console.warn('[INDEXING] Using fallback dimension 768 due to detection failure');
            return 768;
        }
    }

    public async search(query: string, token?: vscode.CancellationToken): Promise<SearchResultItem[]> {
        if (!this._client || !this._activeConfig) {
            console.log(`[SEARCH] Cannot search - client initialized: ${!!this._client}, active config: ${!!this._activeConfig}`);
            vscode.window.showErrorMessage('Indexing service is not initialized. Cannot perform search.');
            return [];
        }

        // Check for cancellation
        if (token?.isCancellationRequested) {
            throw new Error('Search cancelled');
        }

        const collectionName = this._activeConfig.index_info?.name || 'codebase';
        const startTime = Date.now();
        
        console.log(`[SEARCH] Starting search for query: "${query}" in collection '${collectionName}'`);
        
        try {
            const embeddingStartTime = Date.now();
            const vector = await this.generateEmbedding(query, token);
            const embeddingDuration = Date.now() - embeddingStartTime;
            
            // Check for cancellation after embedding generation
            if (token?.isCancellationRequested) {
                throw new Error('Search cancelled');
            }
            
            if (!vector) {
                console.log(`[SEARCH] Failed to generate embedding for query: "${query}"`);
                vscode.window.showWarningMessage('Could not generate embedding for search query.');
                return [];
            }
            
            console.log(`[SEARCH] Embedding generated in ${embeddingDuration}ms with ${vector.length} dimensions`);

            const searchLimit = this._configService.config.search.limit;
            const searchStartTime = Date.now();
            console.log(`[SEARCH] Executing vector search with limit ${searchLimit}`);
            
            // Create AbortController for Qdrant search operation
            const controller = new AbortController();
            
            // Connect CancellationToken to AbortController
            if (token) {
                token.onCancellationRequested(() => {
                    console.log(`[SEARCH] Vector search cancelled via token`);
                    controller.abort();
                });
            }
            
            const searchResult = await this._client.search(collectionName, {
                vector: vector,
                limit: searchLimit,
                // Note: QdrantClient may not support AbortSignal directly
                // We handle cancellation through our token checks and AbortController
            });
            
            const searchDuration = Date.now() - searchStartTime;
            console.log(`[SEARCH] Vector search completed in ${searchDuration}ms`);

            // The search result contains hits with payload.
            // Cast to the expected structure which may have 'points' or 'hits' property.
            const qdrantResult = searchResult as {
                points?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[];
                hits?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[];
            };
            const results = qdrantResult.points || qdrantResult.hits || [];
            
            const totalDuration = Date.now() - startTime;
            console.log(`[SEARCH] Search completed successfully in ${totalDuration}ms, found ${results.length} results`);
            
            return results.map((item): SearchResultItem => ({
                id: item.id,
                score: item.score,
                payload: item.payload,
            }));

        } catch (e) {
            const duration = Date.now() - startTime;
            const error = e instanceof Error ? e : new Error(String(e));
            
            // Handle AbortError specifically
            if (error.name === 'AbortError') {
                console.log(`[SEARCH] Search was aborted after ${duration}ms`);
                throw new Error('Search cancelled');
            }
            
            console.error(`[SEARCH] Search failed in collection ${collectionName} after ${duration}ms:`, {
                message: error.message,
                stack: error.stack,
                name: error.name,
                query,
                collectionName
            });
            
            // Special logging for network-related errors
            if (error.message.includes('ECONNRESET') || error.message.includes('connection reset') ||
                error.message.includes('network') || error.message.includes('fetch')) {
                console.error(`[SEARCH] NETWORK ERROR in search - Type: ${error.name}, Message: ${error.message}`);
                console.error(`[SEARCH] Network error details:`, {
                    query,
                    collectionName,
                    qdrantUrl: this._activeConfig?.qdrant_config.url,
                    timestamp: new Date().toISOString(),
                    duration
                });
            }
            
            vscode.window.showErrorMessage(`Search failed: ${error.message}`);
            return [];
        }
    }

    public dispose(): void {
        this.stopIndexing();
        this._progressListeners = [];
    }
}