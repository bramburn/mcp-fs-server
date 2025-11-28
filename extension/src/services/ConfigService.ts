import * as vscode from "vscode";
import {
  ConfigPath,
  Configuration,
  ConfigurationFactory,
  DefaultConfiguration,
} from "../config/Configuration.js";
import {
  QdrantOllamaConfig,
  TestConfigResponse,
} from "../webviews/protocol.js";
import { ILogger } from "./LoggerService.js";

/**
 * Ensures a URL has a proper protocol (http:// or https://)
 * @param url The URL to check and fix
 * @returns The URL with proper protocol
 */
function ensureAbsoluteUrl(url: string): string {
  if (!url) return url;

  // Check if URL already starts with http:// or https:// (case-insensitive)
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  // Remove any leading slashes and prepend http://
  const cleanUrl = url.replace(/^\/+/, "");
  return `http://${cleanUrl}`;
}

/**
 * Configuration change event emitter
 */
export interface ConfigurationChangeEvent {
  section: string;
  value?: any;
}

export type ConfigurationChangeListener = (
  event: ConfigurationChangeEvent
) => void;

/**
 * Service responsible for managing VS Code configuration and file-based Qdrant configuration
 * Implements proper TypeScript typing and VS Code API integration with change subscription
 */
export class ConfigService implements vscode.Disposable {
  private _disposable: vscode.Disposable;
  private _config: Configuration = DefaultConfiguration;
  private _qdrantConfig: QdrantOllamaConfig | null = null;
  private _listeners: ConfigurationChangeListener[] = [];
  private _disposed = false;

  constructor(
    private readonly _logger: ILogger,
    private readonly _context: vscode.ExtensionContext
  ) {
    // Initialize and load the strongly typed configuration
    this.loadConfiguration();

    // Register a listener for configuration changes
    this._disposable = vscode.workspace.onDidChangeConfiguration(
      this.onConfigurationChanged,
      this
    );
  }

  private _deepClone<T>(obj: T): T {
    // Use JSON methods for reliable deep cloning of JSON-safe objects to ensure immutability.
    if (obj === undefined || obj === null) return obj;
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  private loadConfiguration(): void {
    const vscodeConfig = vscode.workspace.getConfiguration(ConfigPath.GENERAL);
    this._config = ConfigurationFactory.from(vscodeConfig);

    // Validate the loaded configuration
    if (!ConfigurationFactory.validate(this._config)) {
      this._logger.log(
        "Invalid configuration detected, falling back to defaults",
        "WARN"
      );
      this._config = this._deepClone(DefaultConfiguration);
    }
  }

  private onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
    let shouldReload = false;
    let changedSection = "";

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
      const oldConfig = this._deepClone(this._config);
      this.loadConfiguration();

      // Notify listeners of the configuration change
      const event: ConfigurationChangeEvent = {
        section: changedSection,
        value: this.config, // Use getter to pass clone
      };

      this._listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          this._logger.log(
            `Error in configuration change listener: ${error}`,
            "ERROR"
          );
        }
      });

      if (this._config.general.trace) {
        this._logger.log(
          `Configuration changed for section: ${changedSection}`
        );
      }
    }
  }

  /**
   * Attempts to load the Qdrant configuration from a specific workspace folder.
   */
  public async loadQdrantConfig(
    folder: vscode.WorkspaceFolder
  ): Promise<QdrantOllamaConfig | null> {
    // 1. Try Local
    const localUri = vscode.Uri.joinPath(
      folder.uri,
      ".qdrant",
      "configuration.json"
    );
    try {
      await vscode.workspace.fs.stat(localUri);
      const content = await vscode.workspace.fs.readFile(localUri);
      return this.parseAndValidate(content, localUri.toString());
    } catch {
      // Local not found, ignore
    }

    // 2. Try Global
    try {
      const globalUri = this.getGlobalConfigUri(folder);
      await vscode.workspace.fs.stat(globalUri);
      const content = await vscode.workspace.fs.readFile(globalUri);
      this._logger.log(
        `Loaded config from global storage for ${folder.name}`,
        "CONFIG"
      );
      return this.parseAndValidate(content, globalUri.toString());
    } catch {
      // Global not found
    }

    return null;
  }

  /**
   * Saves the Qdrant configuration to the active workspace folder.
   * Creates the .qdrant directory if it doesn't exist.
   */
  public async saveQdrantConfig(
    folder: vscode.WorkspaceFolder,
    config: QdrantOllamaConfig,
    useGlobal: boolean = false
  ): Promise<void> {
    try {
      // Cleanup URLs for active providers
      if (config.qdrant_config?.url) {
        config.qdrant_config.url = ensureAbsoluteUrl(
          config.qdrant_config.url
        ).replace(/\/$/, "");
      }
      if (config.ollama_config?.base_url) {
        config.ollama_config.base_url = ensureAbsoluteUrl(
          config.ollama_config.base_url
        ).replace(/\/$/, "");
      }

      const content = new TextEncoder().encode(JSON.stringify(config, null, 2));

      if (useGlobal) {
        const globalUri = this.getGlobalConfigUri(folder);
        await vscode.workspace.fs.createDirectory(
          vscode.Uri.joinPath(this._context.globalStorageUri, "configs")
        );
        await vscode.workspace.fs.writeFile(globalUri, content);
        this._logger.log(`Saved config globally for ${folder.name}`, "CONFIG");
      } else {
        const dirUri = vscode.Uri.joinPath(folder.uri, ".qdrant");
        const fileUri = vscode.Uri.joinPath(dirUri, "configuration.json");
        try {
          await vscode.workspace.fs.stat(dirUri);
        } catch {
          await vscode.workspace.fs.createDirectory(dirUri);
        }
        await vscode.workspace.fs.writeFile(fileUri, content);
        this._logger.log(`Saved config locally to ${fileUri.fsPath}`, "CONFIG");
      }

      this._qdrantConfig = config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save configuration: ${message}`);
    }
  }

  /**
   * Verifies that the configured services are reachable with retry logic for transient failures.
   */
  public async validateConnection(
    config: QdrantOllamaConfig
  ): Promise<boolean> {
    const res = await this.validateConnectionDetailed(config);
    return res.success;
  }

  public async validateConnectionDetailed(
    config: QdrantOllamaConfig
  ): Promise<TestConfigResponse> {
    let dbStatus: "connected" | "failed" = "failed";
    let embedStatus: "connected" | "failed" = "failed";
    const errors: string[] = [];

    // 1. Test Active Embedding Provider
    try {
      if (
        config.active_embedding_provider === "ollama" &&
        config.ollama_config
      ) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${config.ollama_config.base_url}/api/tags`, {
          signal: controller.signal,
        });
        if (res.ok) embedStatus = "connected";
        else errors.push(`Ollama: ${res.statusText}`);
      } else if (
        config.active_embedding_provider === "openai" &&
        config.openai_config
      ) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${config.openai_config.api_key}`,
          },
          signal: controller.signal,
        });
        if (res.ok) embedStatus = "connected";
        else errors.push(`OpenAI: ${res.statusText}`);
      } else if (
        config.active_embedding_provider === "gemini" &&
        config.gemini_config
      ) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        // Simple validity check using models list endpoint
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${config.gemini_config.api_key}`,
          {
            signal: controller.signal,
          }
        );
        if (res.ok) embedStatus = "connected";
        else errors.push(`Gemini: ${res.statusText}`);
      }
    } catch (e) {
      errors.push(
        `Embedding Provider Error: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    // 2. Test Active Vector DB
    try {
      if (config.active_vector_db === "qdrant" && config.qdrant_config) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${config.qdrant_config.url}/collections`, {
          signal: controller.signal,
        });
        if (res.ok || res.status === 401 || res.status === 403)
          dbStatus = "connected"; // Auth error means reachable
        else errors.push(`Qdrant: ${res.statusText}`);
      } else if (
        config.active_vector_db === "pinecone" &&
        config.pinecone_config
      ) {
        // Pinecone requires a known controller endpoint.
        // For a simple check, we can try to reach the general API if possible,
        // or just assume config presence is enough if no SDK is active.
        if (
          config.pinecone_config.api_key &&
          config.pinecone_config.environment
        ) {
          dbStatus = "connected"; // Weak check without SDK
        } else {
          errors.push("Pinecone: Missing configuration");
        }
      }
    } catch (e) {
      errors.push(
        `Vector DB Error: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const success = dbStatus === "connected" && embedStatus === "connected";

    return {
      success,
      qdrantStatus: dbStatus, // Reuse existing field names for compatibility
      ollamaStatus: embedStatus,
      message: success ? "All systems operational" : errors.join(" | "),
    };
  }

  /**
   * Retry helper with exponential backoff for transient network failures
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isLastAttempt = attempt === maxAttempts;

        if (isLastAttempt) {
          throw lastError;
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
          `[CONFIG] Retry attempt ${
            attempt + 1
          } after ${delay}ms due to: ${errorMsg}`,
          "WARN"
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get the current VS Code configuration
   */
  public get config(): Configuration {
    // Explicitly clone to ensure immutability
    return this._deepClone(this._config);
  }

  /**
   * Get the current Qdrant configuration
   */
  public get qdrantConfig(): QdrantOllamaConfig | null {
    // Use the deep clone helper to ensure immutability
    return this._deepClone(this._qdrantConfig);
  }

  /**
   * Add a listener for configuration changes
   */
  public addConfigurationChangeListener(
    listener: ConfigurationChangeListener
  ): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a configuration change listener
   */
  public removeConfigurationChangeListener(
    listener: ConfigurationChangeListener
  ): void {
    const index = this._listeners.indexOf(listener);
    if (index > -1) {
      this._listeners.splice(index, 1);
    }
  }

  /**
   * Get a specific configuration value
   * @throws Error if the configuration path does not exist
   */
  public get<T>(key: string): T {
    const keys = key.split(".");
    let value: any = this._deepClone(this._config);

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        throw new Error(
          `Configuration key "${key}" not found. Path traversal failed at "${k}".`
        );
      }
    }

    return value as T;
  }

  /**
   * Update a configuration value (this updates the in-memory config only)
   */
  public update(key: string, value: any): void {
    const keys = key.split(".");
    let target: any = this._config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k];
    }

    target[keys[keys.length - 1]] = value;

    // Notify listeners of change
    this._listeners.forEach((listener) => {
      try {
        listener({ section: key, value });
      } catch (error) {
        this._logger.log(
          `Error in configuration change listener: ${error}`,
          "ERROR"
        );
      }
    });
  }

  /**
   * Update a VS Code workspace setting
   * @param key Configuration key (e.g., "search.limit")
   * @param value Value to set
   * @param global Whether to update global (user) settings or workspace settings
   */
  public async updateVSCodeSetting(
    key: string,
    value: any,
    global: boolean = false
  ): Promise<void> {
    try {
      const fullKey = `${ConfigPath.GENERAL}.${key}`;
      const config = vscode.workspace.getConfiguration();
      await config.update(fullKey, value, global);

      // Also update in-memory config
      this.update(key, value);

      this._logger.log(
        `Updated VS Code setting: ${fullKey} = ${JSON.stringify(
          value
        )} (global: ${global})`
      );
    } catch (error) {
      this._logger.log(
        `Failed to update VS Code setting ${key}: ${error}`,
        "ERROR"
      );
      throw error;
    }
  }

  private getGlobalConfigUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    // Create a safe filename based on the workspace name and hash of the path to avoid collisions
    const safeName = folder.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    return vscode.Uri.joinPath(
      this._context.globalStorageUri,
      "configs",
      `${safeName}.json`
    );
  }

  private parseAndValidate(
    content: Uint8Array,
    source: string
  ): QdrantOllamaConfig | null {
    const str = new TextDecoder().decode(content);
    const config = JSON.parse(str) as QdrantOllamaConfig;

    // Validate required fields based on active providers
    if (!config.active_vector_db || !config.active_embedding_provider) {
      this._logger.log(
        `Invalid config in ${source}: missing active provider selections`,
        "ERROR"
      );
      return null;
    }

    // Validate active vector DB config exists
    if (config.active_vector_db === "qdrant" && !config.qdrant_config?.url) {
      this._logger.log(
        `Invalid config in ${source}: Qdrant selected but config missing`,
        "ERROR"
      );
      return null;
    }
    if (
      config.active_vector_db === "pinecone" &&
      !config.pinecone_config?.index_name
    ) {
      this._logger.log(
        `Invalid config in ${source}: Pinecone selected but config missing`,
        "ERROR"
      );
      return null;
    }

    // Validate active embedding provider config exists
    if (
      config.active_embedding_provider === "ollama" &&
      !config.ollama_config?.base_url
    ) {
      this._logger.log(
        `Invalid config in ${source}: Ollama selected but config missing`,
        "ERROR"
      );
      return null;
    }
    if (
      config.active_embedding_provider === "openai" &&
      !config.openai_config?.api_key
    ) {
      this._logger.log(
        `Invalid config in ${source}: OpenAI selected but config missing`,
        "ERROR"
      );
      return null;
    }
    if (
      config.active_embedding_provider === "gemini" &&
      !config.gemini_config?.api_key
    ) {
      this._logger.log(
        `Invalid config in ${source}: Gemini selected but config missing`,
        "ERROR"
      );
      return null;
    }

    // Cleanup URLs for providers that have them
    if (config.qdrant_config?.url) {
      config.qdrant_config.url = ensureAbsoluteUrl(
        config.qdrant_config.url
      ).replace(/\/$/, "");
    }
    if (config.ollama_config?.base_url) {
      config.ollama_config.base_url = ensureAbsoluteUrl(
        config.ollama_config.base_url
      ).replace(/\/$/, "");
    }

    this._qdrantConfig = config;
    return this._deepClone(config);
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._disposable.dispose();
    this._listeners = [];
  }
}
