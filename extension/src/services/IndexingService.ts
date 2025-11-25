import * as vscode from 'vscode';
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { CodeSplitter } from 'shared/code-splitter.js';

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
        private readonly _context: vscode.ExtensionContext
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
            const isHealthy = await this._configService.validateConnection(config);
            if (!isHealthy) {
                throw new Error('Could not connect to Qdrant or Ollama. Check your configuration and ensure services are running.');
            }

            this._activeConfig = config;
            this._client = new QdrantClient({
                url: config.qdrant_config.url,
                apiKey: config.qdrant_config.api_key,
            });

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
            
            // Ensure Collection Exists
            await this.ensureCollection(collectionName, 768);

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
                    // FIX: Re-throw cancellation errors so they are caught by the outer catch
                    if (err instanceof Error && err.message === 'Indexing cancelled') {
                        throw err;
                    }
                    if (token.isCancellationRequested) {
                        throw new Error('Indexing cancelled');
                    }
                    console.error(`Failed to index file ${fileUri.fsPath}:`, err);
                }
            }

            this.notifyProgress({
                current: processedCount,
                total: files.length,
                status: 'completed'
            });

            vscode.window.showInformationMessage(`Indexed ${processedCount} files successfully to collection '${collectionName}'.`);

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
        
        try {
            const collections = await this._client.getCollections();
            const exists = collections.collections.some(c => c.name === name);
            
            if (!exists) {
                // Check for cancellation again
                if (token?.isCancellationRequested) {
                    throw new Error('Indexing cancelled');
                }
                
                await this._client.createCollection(name, {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    },
                });
            }
        } catch (e) {
            console.error('Error checking/creating collection:', e);
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
            
            await this._client.upsert(collectionName, {
                points: points
            });
        }
    }

    private async generateEmbedding(text: string, token?: vscode.CancellationToken): Promise<number[] | null> {
        // Check for cancellation
        if (token?.isCancellationRequested) {
            throw new Error('Indexing cancelled');
        }

        if (!this._activeConfig) return null;

        const { base_url, model } = this._activeConfig.ollama_config;

        try {
            const response = await fetch(`${base_url}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: text
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama Error: ${response.statusText}`);
            }

            const data = await response.json() as { embedding: number[] };
            return data.embedding;
        } catch (e) {
            console.error('Embedding generation failed:', e);
            return null;
        }
    }

    public async search(query: string): Promise<SearchResultItem[]> {
        if (!this._client || !this._activeConfig) {
            vscode.window.showErrorMessage('Indexing service is not initialized. Cannot perform search.');
            return [];
        }

        const collectionName = this._activeConfig.index_info?.name || 'codebase';
        
        try {
            const vector = await this.generateEmbedding(query);
            if (!vector) {
                vscode.window.showWarningMessage('Could not generate embedding for search query.');
                return [];
            }

            const searchLimit = this._configService.config.search.limit;
            const searchResult = await this._client.search(collectionName, {
                vector: vector,
                limit: searchLimit,
            });

            // The search result contains hits with payload.
            // Cast to the expected structure which may have 'points' or 'hits' property.
            const qdrantResult = searchResult as { 
                points?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[]; 
                hits?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[]; 
            };
            const results = qdrantResult.points || qdrantResult.hits || [];
            
            return results.map((item): SearchResultItem => ({
                id: item.id,
                score: item.score,
                payload: item.payload,
            }));

        } catch (e) {
            console.error(`Search failed in collection ${collectionName}:`, e);
            vscode.window.showErrorMessage(`Search failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return [];
        }
    }

    public dispose(): void {
        this.stopIndexing();
        this._progressListeners = [];
    }
}