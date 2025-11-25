import * as vscode from 'vscode'; // eslint-disable-line no-unused-vars
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { QdrantClient } from '@qdrant/js-client-rest'; // eslint-disable-line no-unused-vars
import { CodeSplitter } from 'shared/code-splitter.js';

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
            
            // Ensure Collection Exists
            await this.ensureCollection(collectionName, 768); 

            // Find files
            const excludePattern = new vscode.RelativePattern(folder, '**/{node_modules,.git,out,dist,build,.svelte-kit}/**');
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/*.{ts,js,svelte,json,md,txt,html,css}'),
                excludePattern,
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

    public async search(query: string): Promise<any[]> {
        return [];
    }
}