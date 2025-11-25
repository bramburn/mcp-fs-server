import * as vscode from 'vscode';
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { QdrantClient } from '@qdrant/js-client-rest';
// !AI: MVP assumption: The shared code splitter logic (which might use WASM) is robust and handles context splitting optimally for all target languages.
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
 * Core service to handle file indexing and interaction with Qdrant/Ollama.
 * Refactored to use shared chunking logic.
 */
export class IndexingService {
    private _isIndexing = false;
    private _client: QdrantClient | null = null;
    private _activeConfig: QdrantOllamaConfig | null = null;
    private _splitter: CodeSplitter;

    constructor(
        private readonly _configService: ConfigService,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._splitter = new CodeSplitter();
    }

    /**
     * Triggers the indexing process for the given workspace folder.
     */
    public async indexWorkspace(folder: vscode.WorkspaceFolder): Promise<void> {
        if (this._isIndexing) {
            vscode.window.showWarningMessage('Indexing is already in progress.');
            return;
        }

        const config = await this._configService.loadConfig(folder);
        if (!config) {
            vscode.window.showErrorMessage(`No valid configuration found in ${folder.name}. Please create .qdrant/configuration.json`);
            return;
        }
        
        // Validate connections before starting heavy work
// !AI: MVP workflow: Connection validation is synchronous/blocking here. For larger setups, this should perhaps be asynchronous or backgrounded, but for MVP, this is an acceptable blocking step.
        const isHealthy = await this._configService.validateConnection(config);
        if (!isHealthy) {
            vscode.window.showErrorMessage('Could not connect to Qdrant or Ollama. Check your configuration and ensure services are running.');
            return;
        }

        this._isIndexing = true;
        this._activeConfig = config;
        this._client = new QdrantClient({
            url: config.qdrant_config.url,
            apiKey: config.qdrant_config.api_key,
        });

        // !AI: MVP dependency: Relies on specific WASM files being present in the extension resources directory for advanced splitting. This adds complexity to extension packaging and setup.
        // Initialize Splitter with WASM paths
        try {
            const wasmPath = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'tree-sitter.wasm').fsPath;
            const langPath = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'tree-sitter-typescript.wasm').fsPath;
            await this._splitter.initialize(wasmPath, langPath);
        } catch (e) {
            console.warn('Failed to init splitter WASM (falling back to line split):', e);
        }

        vscode.window.setStatusBarMessage('$(sync~spin) Qdrant: Indexing...', 3000);

        try {
            const collectionName = config.index_info?.name || 'codebase';
            
            // !AI: MVP data structure: Hardcoded vector size of 768. This is tied to the default embedding model (likely Nomic Embed). Should be configurable based on the selected Ollama model for flexibility.
            // Ensure Collection Exists
            await this.ensureCollection(collectionName, 768);

            // Find files
            const excludePattern = new vscode.RelativePattern(folder, '**/{node_modules,.git,out,dist,build,.svelte-kit}/**');
            const files = await vscode.workspace.findFiles(
                // !AI: MVP scope: File inclusion is based on a fixed list of extensions. Should be configurable or dynamically derived from project settings/language configuration.
                new vscode.RelativePattern(folder, '**/*.{ts,js,svelte,json,md,txt,html,css}'),
                excludePattern,
                // !AI: MVP scope/data structure: Hard limit of 500 files indexed per workspace. This is a major constraint for large codebases in the MVP.
                500
            );

            let processedCount = 0;
            
            for (const fileUri of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    const text = new TextDecoder().decode(content);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);

                    await this.indexFile(collectionName, relativePath, text);
                    processedCount++;
                } catch (err) {
                    console.error(`Failed to index file ${fileUri.fsPath}:`, err);
                }
            }

            vscode.window.showInformationMessage(`Indexed ${processedCount} files successfully to collection '${collectionName}'.`);

        } catch (error) {
            console.error('Indexing critical failure:', error);
            vscode.window.showErrorMessage(`Indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this._isIndexing = false;
        }
    }

    private async ensureCollection(name: string, vectorSize: number) {
        if (!this._client) return;
        
        try {
            const collections = await this._client.getCollections();
            const exists = collections.collections.some(c => c.name === name);
            
            if (!exists) {
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
     * Breaks file content into chunks, embeds them, and uploads to Qdrant.
     */
    private async indexFile(collectionName: string, filePath: string, content: string) {
        // Use the shared splitter logic
        const chunks = this._splitter.split(content, filePath);
        
        if (chunks.length === 0) return;

        const points = [];

        for (const chunk of chunks) {
            // !AI: MVP assumption/workflow: Silent failure on embedding generation (returns null and continues) leads to data loss in Qdrant for that chunk. Needs better error reporting or retry logic for MVP reliability.
            const vector = await this.generateEmbedding(chunk.content);
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
            await this._client.upsert(collectionName, {
                points: points
            });
        }
    }

    private async generateEmbedding(text: string): Promise<number[] | null> {
        // !AI: MVP assumption: Ollama service is running locally at a fixed, known path (`base_url`) and is accessible over HTTP without proxy/network issues.
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

            const searchResult = await this._client.search(collectionName, {
                vector: vector,
                // !AI: MVP configuration: Hardcoded search limit of 10 results. This should be configurable in the settings.
                limit: 10, // Default limit, can be configurable later
            });

            // !AI: MVP data structure fragility: Casting the Qdrant response is brittle and suggests the underlying library's return type isn't cleanly typed or consistent between versions/client usage.
            // The search result contains hits with payload.
            // Cast to the expected structure which may have 'points' or 'hits' property.
            const qdrantResult = searchResult as { points?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[]; hits?: { id: string | number, score: number, payload: SearchResultItem['payload'] }[] };
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
}