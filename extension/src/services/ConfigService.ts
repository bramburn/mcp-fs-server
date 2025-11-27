import * as vscode from "vscode";
import {
  ConfigPath,
  Configuration,
  ConfigurationFactory,
  DefaultConfiguration,
} from "../config/Configuration.js";
import { QdrantOllamaConfig } from "../webviews/protocol.js";
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

  constructor(private readonly _logger: ILogger) {
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
    const configUri = vscode.Uri.joinPath(
      folder.uri,
      ".qdrant",
      "configuration.json"
    );

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
        this._logger.log(
          `Invalid configuration structure in ${configUri.toString()}`,
          "ERROR"
        );
        return null;
      }

      // Ensure URLs have proper protocols
      config.qdrant_config.url = ensureAbsoluteUrl(config.qdrant_config.url);
      config.ollama_config.base_url = ensureAbsoluteUrl(
        config.ollama_config.base_url
      );

      // Remove trailing slashes for consistent URL handling
      config.qdrant_config.url = config.qdrant_config.url.replace(/\/$/, "");
      config.ollama_config.base_url = config.ollama_config.base_url.replace(
        /\/$/,
        ""
      );

      this._qdrantConfig = config;
      return this._deepClone(config);
    } catch (error) {
      this._logger.log(
        `Could not load config from ${folder.name}: ${error}`,
        "WARN"
      );
      return null;
    }
  }

  /**
   * Saves the Qdrant configuration to the active workspace folder.
   * Creates the .qdrant directory if it doesn't exist.
   */
  public async saveQdrantConfig(
    folder: vscode.WorkspaceFolder,
    config: QdrantOllamaConfig
  ): Promise<void> {
    const dirUri = vscode.Uri.joinPath(folder.uri, ".qdrant");
    const configUri = vscode.Uri.joinPath(dirUri, "configuration.json");

    try {
      // Ensure .qdrant directory exists
      try {
        await vscode.workspace.fs.stat(dirUri);
      } catch {
        await vscode.workspace.fs.createDirectory(dirUri);
      }

      // Ensure URLs are clean before saving
      config.qdrant_config.url = ensureAbsoluteUrl(
        config.qdrant_config.url
      ).replace(/\/$/, "");
      config.ollama_config.base_url = ensureAbsoluteUrl(
        config.ollama_config.base_url
      ).replace(/\/$/, "");

      // Write file
      const content = new TextEncoder().encode(JSON.stringify(config, null, 2));
      await vscode.workspace.fs.writeFile(configUri, content);

      // Update in-memory state
      this._qdrantConfig = config;
      this._logger.log(`Configuration saved to ${configUri.fsPath}`, "CONFIG");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this._logger.log(`Failed to save config: ${msg}`, "ERROR");
      throw new Error(`Failed to save configuration: ${msg}`);
    }
  }

  /**
   * Verifies that the configured services are reachable with retry logic for transient failures.
   */
  public async validateConnection(
    config: QdrantOllamaConfig
  ): Promise<boolean> {
    const startTime = Date.now();
    this._logger.log(
      `[CONFIG] Starting connection validation - Ollama: ${config.ollama_config.base_url}, Qdrant: ${config.qdrant_config.url}`,
      "CONFIG"
    );

    try {
      // Use retry logic for transient network failures
      return await this.retryWithBackoff(
        async () => {
          // Check Ollama with timeout
          this._logger.log(
            `[CONFIG] Testing Ollama connection to ${config.ollama_config.base_url}/api/tags`,
            "CONFIG"
          );

          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            this._logger.log(
              `[CONFIG] Ollama connection timeout, aborting...`,
              "WARN"
            );
            controller.abort();
          }, 10000); // 10 second timeout

          const ollamaRes = await fetch(
            `${config.ollama_config.base_url}/api/tags`,
            { signal: controller.signal }
          );

          clearTimeout(timeoutId);

          if (!ollamaRes.ok) {
            const errorText = await ollamaRes
              .text()
              .catch(() => "Unable to read error response");
            this._logger.log(
              `[CONFIG] Ollama connection failed - Status: ${ollamaRes.status}, Response: ${errorText}`,
              "ERROR"
            );
            throw new Error(
              `Ollama unreachable: ${ollamaRes.status} ${ollamaRes.statusText}`
            );
          }

          // Check Qdrant with timeout
          this._logger.log(
            `[CONFIG] Testing Qdrant connection to ${config.qdrant_config.url}/collections`,
            "CONFIG"
          );

          const qdrantController = new AbortController();
          const qdrantTimeoutId = setTimeout(() => {
            this._logger.log(
              `[CONFIG] Qdrant connection timeout, aborting...`,
              "WARN"
            );
            qdrantController.abort();
          }, 10000); // 10 second timeout

          const qdrantRes = await fetch(
            `${config.qdrant_config.url}/collections`,
            {
              signal: qdrantController.signal,
            }
          );

          clearTimeout(qdrantTimeoutId);

          if (
            !qdrantRes.ok &&
            qdrantRes.status !== 401 &&
            qdrantRes.status !== 403
          ) {
            // 401/403 might just mean we need to API key which IndexingService handles
            const errorText = await qdrantRes
              .text()
              .catch(() => "Unable to read error response");
            this._logger.log(
              `[CONFIG] Qdrant connection failed - Status: ${qdrantRes.status}, Response: ${errorText}`,
              "ERROR"
            );
            throw new Error(
              `Qdrant unreachable: ${qdrantRes.status} ${qdrantRes.statusText}`
            );
          }

          const totalDuration = Date.now() - startTime;
          this._logger.log(
            `[CONFIG] Connection validation successful in ${totalDuration}ms`,
            "CONFIG"
          );
          return true;
        },
        3, // Max retries
        1000 // 1 second delay
      );
    } catch (e) {
      const totalDuration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));
      this._logger.log(
        `[CONFIG] Connection validation failed after ${totalDuration}ms: ${error.message}`,
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
          `[CONFIG] NETWORK ERROR DETECTED - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
        this._logger.log(`[CONFIG] Details: ${error.message}`, "FATAL");
      }

      return false;
    }
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

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._disposable.dispose();
    this._listeners = [];
  }
}
