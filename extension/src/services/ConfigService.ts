import * as vscode from 'vscode';
import { Configuration, ConfigPath, ConfigurationFactory, DefaultConfiguration } from '../config/Configuration.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';

/**
 * Configuration change event emitter
 */
export interface ConfigurationChangeEvent {
    section: string;
    value?: any;
}

export type ConfigurationChangeListener = (event: ConfigurationChangeEvent) => void;

/**
 * Service responsible for managing VS Code configuration and file-based Qdrant configuration
 * Implements proper TypeScript typing and VS Code API integration with change subscription
 */
export class ConfigService implements vscode.Disposable {
    private _disposable: vscode.Disposable;
    private _config: Configuration = DefaultConfiguration;
    private _qdrantConfig: QdrantOllamaConfig | null = null;
    private _listeners: ConfigurationChangeListener[] = [];

    constructor() {
        // Initialize and load the strongly typed configuration
        this.loadConfiguration();
        
        // Register a listener for configuration changes
        this._disposable = vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this);
    }

    private _deepClone<T>(obj: T): T {
        // Use JSON methods for reliable deep cloning of JSON-safe objects to ensure immutability.
        // This is a standard and safe way for configuration objects.
        return JSON.parse(JSON.stringify(obj)) as T;
    }

    private loadConfiguration(): void {
        const vscodeConfig = vscode.workspace.getConfiguration(ConfigPath.GENERAL);
        this._config = ConfigurationFactory.from(vscodeConfig);
        
        // Validate the loaded configuration
        if (!ConfigurationFactory.validate(this._config)) {
            console.warn('Invalid configuration detected, falling back to defaults');
            this._config = DefaultConfiguration;
        }
    }

    private onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
        let shouldReload = false;
        let changedSection = '';

        // Check if configuration sections relevant to this service have changed
        if (e.affectsConfiguration(ConfigPath.GENERAL)) {
            shouldReload = true;
            changedSection = ConfigPath.GENERAL;
        }

        if (e.affectsConfiguration(ConfigPath.INDEXING)) {
            shouldReload = true;
            changedSection = ConfigPath.INDEXING;
        }

        if (e.affectsConfiguration(ConfigPath.SEARCH)) {
            shouldReload = true;
            changedSection = ConfigPath.SEARCH;
        }

        if (shouldReload) {
            const oldConfig = { ...this._config };
            this.loadConfiguration();
            
            // Notify listeners of the configuration change
            const event: ConfigurationChangeEvent = {
                section: changedSection,
                value: this._config
            };

            this._listeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    console.error('Error in configuration change listener:', error);
                }
            });

            if (this._config.general.trace) {
                console.log(`Configuration changed for section: ${changedSection}`, {
                    old: oldConfig,
                    new: this._config
                });
            }
        }
    }

    /**
     * Attempts to load the Qdrant configuration from a specific workspace folder.
     */
    public async loadQdrantConfig(folder: vscode.WorkspaceFolder): Promise<QdrantOllamaConfig | null> {
        const configUri = vscode.Uri.joinPath(folder.uri, '.qdrant', 'configuration.json');

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

            this._qdrantConfig = config;
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

    /**
     * Get the current VS Code configuration
     */
    public get config(): Configuration {
        // Use the deep clone helper to ensure immutability
        return this._deepClone(this._config); 
    }

    /**
     * Get the current Qdrant configuration
     */
    public get qdrantConfig(): QdrantOllamaConfig | null {
        // Use the deep clone helper to ensure immutability
        return this._qdrantConfig ? this._deepClone(this._qdrantConfig) : null;
    }

    /**
     * Add a listener for configuration changes
     */
    public addConfigurationChangeListener(listener: ConfigurationChangeListener): void {
        this._listeners.push(listener);
    }

    /**
     * Remove a configuration change listener
     */
    public removeConfigurationChangeListener(listener: ConfigurationChangeListener): void {
        const index = this._listeners.indexOf(listener);
        if (index > -1) {
            this._listeners.splice(index, 1);
        }
    }

    /**
     * Get a specific configuration value
     */
    public get<T>(key: string): T {
        const keys = key.split('.');
        let value: any = this._config;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return undefined as T;
            }
        }
        
        return value as T;
    }

    /**
     * Update a configuration value (this updates the in-memory config only)
     */
    public update(key: string, value: any): void {
        const keys = key.split('.');
        let target: any = this._config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in target) || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }
        
        target[keys[keys.length - 1]] = value;
        
        // Notify listeners of the change
        this._listeners.forEach(listener => {
            try {
                listener({ section: key, value });
            } catch (error) {
                console.error('Error in configuration change listener:', error);
            }
        });
    }

    public dispose(): void {
        this._disposable.dispose();
        this._listeners = [];
    }
}