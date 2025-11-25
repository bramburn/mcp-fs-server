import * as vscode from 'vscode';
import { QdrantOllamaConfig } from '../webviews/protocol';

/**
 * Responsible for reading and validating the .qdrant/configuration.json file
 * from the workspace. Uses VFS to support remote workspaces.
 */
export class ConfigService {
    private static readonly CONFIG_FILENAME = 'configuration.json';
    private static readonly CONFIG_DIR = '.qdrant';

    constructor(private readonly _context: vscode.ExtensionContext) {}

    /**
     * Attempts to load the configuration from a specific workspace folder.
     */
    public async loadConfig(folder: vscode.WorkspaceFolder): Promise<QdrantOllamaConfig | null> {
        const configUri = vscode.Uri.joinPath(folder.uri, ConfigService.CONFIG_DIR, ConfigService.CONFIG_FILENAME);

        try {
            // Check if file exists
            await vscode.workspace.fs.stat(configUri);

            // Read file content using VFS
            const fileData = await vscode.workspace.fs.readFile(configUri);
            const fileString = new TextDecoder().decode(fileData);
            
            // Parse JSON
            const config = JSON.parse(fileString) as QdrantOllamaConfig;
            
            // Basic validation
            if (!config.qdrant_config?.url || !config.ollama_config?.base_url) {
                console.error(`Invalid configuration structure in ${configUri.toString()}`);
                return null;
            }

            // Ensure URLs do not have trailing slashes for easier concatenation
            config.qdrant_config.url = config.qdrant_config.url.replace(/\/$/, "");
            config.ollama_config.base_url = config.ollama_config.base_url.replace(/\/$/, "");

            return config;

        } catch (error) {
            console.warn(`Could not load config from ${folder.name}:`, error);
            return null;
        }
    }

    /**
     * Verifies that the configured services are reachable.
     */
    public async validateConnection(config: QdrantOllamaConfig): Promise<boolean> {
        try {
            // Check Ollama
            const ollamaRes = await fetch(`${config.ollama_config.base_url}/api/tags`);
            if (!ollamaRes.ok) throw new Error('Ollama unreachable');

            // Check Qdrant (Basic health check via collections list or telemetry)
            // Using a simple fetch here to avoid instantiating the full client just for a check, 
            // but the IndexingService will handle the full connection.
            const qdrantRes = await fetch(`${config.qdrant_config.url}/collections`);
            if (!qdrantRes.ok && qdrantRes.status !== 401 && qdrantRes.status !== 403) {
                 // 401/403 might just mean we need the API key which IndexingService handles
                 throw new Error('Qdrant unreachable');
            }

            return true;
        } catch (e) {
            console.error('Connection validation failed:', e);
            return false;
        }
    }
}
// !AI: MVP connection validation assumes authentication issues for Qdrant collection listing (401/403) are correctly handled later by IndexingService.