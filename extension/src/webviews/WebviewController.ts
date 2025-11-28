import * as vscode from "vscode";
import { AnalyticsService } from "../services/AnalyticsService.js";
import { ClipboardService } from "../services/ClipboardService.js";
import { ConfigService } from "../services/ConfigService.js";
import { IndexingService } from "../services/IndexingService.js";
import { ILogger } from "../services/LoggerService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";
import {
  CONFIG_DATA_METHOD,
  COPY_RESULTS_METHOD,
  CopyResultsParams,
  DID_CHANGE_CONFIG_NOTIFICATION,
  DidChangeConfigurationNotification,
  EXECUTE_COMMAND_METHOD,
  ExecuteCommand,
  // New imports for copy results
  FileSnippetResult,
  GET_SEARCH_SETTINGS_METHOD,
  GetSearchSettingsResponse,
  INDEX_STATUS_METHOD,
  IpcCommand,
  IpcMessage,
  IpcNotification,
  IpcRequest,
  IpcResponse,
  IpcScope,
  LOAD_CONFIG_METHOD,
  OPEN_FILE_METHOD,
  OpenFileParams,
  QdrantOllamaConfig,
  SAVE_CONFIG_METHOD,
  SaveConfigParams,
  SEARCH_METHOD,
  SearchRequestParams,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  TestConfigParams,
  TestConfigResponse,
  UPDATE_SEARCH_SETTINGS_METHOD,
  UpdateSearchSettingsParams,
} from "./protocol.js";

/**
 * Generate a cryptographically random nonce for CSP
 * @returns A 32-character random string suitable for use as a CSP nonce
 */
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * P2.1: React Webview Setup and Hosting
 * Manages the Webview Panel (Sidebar) and handles IPC messaging.
 */
export class WebviewController
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = "qdrant.search.view";
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _isViewVisible: boolean = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _indexingService: IndexingService,
    private readonly _workspaceManager: WorkspaceManager,
    private readonly _configService: ConfigService,
    private readonly _analyticsService: AnalyticsService,
    private readonly _logger: ILogger,
    private readonly _clipboardService: ClipboardService
  ) {
    this._logger.log(
      `WebviewController created for viewType ${
        WebviewController.viewType
      } with extensionUri ${this._extensionUri.toString()}`,
      "WEBVIEW"
    );
    this._analyticsService.trackEvent("controller.created", {
      viewType: WebviewController.viewType,
    });
  }

  // Helper log wrapper
  private log(message: string, level: any = "INFO") {
    const safeLevel = ["INFO", "ERROR", "WARN", "FATAL"].includes(level)
      ? level
      : "INFO";
    this._logger.log(message, safeLevel);
  }

  // Helper method to get language from file extension for syntax highlighting
  private getLanguageFromExtension(extension: string): string {
    const languageMap: { [key: string]: string } = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      rust: "rust",
      rs: "rust",
      go: "go",
      kt: "kotlin",
      kts: "kotlin",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      rb: "ruby",
      swift: "swift",
      scala: "scala",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      fish: "bash",
      ps1: "powershell",
      bat: "batch",
      cmd: "batch",
      html: "html",
      htm: "html",
      xml: "xml",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      toml: "toml",
      ini: "ini",
      sql: "sql",
      md: "markdown",
      dockerfile: "dockerfile",
      docker: "dockerfile",
      makefile: "makefile",
      vue: "vue",
      svelte: "svelte",
      astro: "astro",
    };

    return languageMap[extension] || "text";
  }

  public dispose() {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.log(
      `🎯 resolveWebviewView called for ${WebviewController.viewType}`,
      "WEBVIEW"
    );

    try {
      this._view = webviewView;
      this._analyticsService.trackPageView("search_view");

      vscode.commands.executeCommand(
        "setContext",
        "qdrant.searchView.visible",
        true
      ); // !AI: Future - 'setContext' is an internal command; consider using a public API if available for better stability across VS Code versions.

      webviewView.onDidChangeVisibility(() => {
        this._isViewVisible = webviewView.visible;
        vscode.commands.executeCommand(
          "setContext",
          "qdrant.searchView.focused",
          webviewView.visible
        ); // !AI: Future - 'setContext' is an internal command; consider using a public API if available for better stability across VS Code versions.
      });

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
        ],
      };

      const html = this._getHtmlForWebview(webviewView.webview);
      this.log(
        `📝 Setting webview HTML, length: ${html.length} bytes`,
        "WEBVIEW"
      );
      webviewView.webview.html = html;

      const listener = webviewView.webview.onDidReceiveMessage(
        async (data: any) => {
          this.log(
            `[IPC Host] Received message from webview: ${JSON.stringify(data)}`,
            "WEBVIEW"
          );
          const message: any = data;

          // Handle simple debug/fallback commands from error HTML
          if (message && typeof message.command === "string") {
            this.log(
              `[IPC Host] Processing fallback command: ${message.command}`,
              "WEBVIEW"
            );
            switch (message.command) {
              case "extension.reload": {
                this.log(
                  "Received extension.reload from webview fallback",
                  "WEBVIEW"
                );
                this._analyticsService.trackEvent(
                  "webview.fallback.reloadClicked",
                  {
                    viewType: WebviewController.viewType,
                  }
                );
                vscode.commands.executeCommand("workbench.action.reloadWindow");
                return;
              }
              case "debug.error": {
                this.log(
                  `Received debug.error from webview fallback: ${JSON.stringify(
                    message.data
                  )}`,
                  "WEBVIEW"
                );
                this._analyticsService.trackError(
                  "webview_fallback_error",
                  typeof message.data === "string"
                    ? message.data
                    : JSON.stringify(message.data)
                );
                return;
              }
              default: {
                this.log(
                  `Received unknown fallback command from webview: ${message.command}`,
                  "WEBVIEW"
                );
                break;
              }
            }
          }

          const typed = data as IpcMessage;
          const method = "method" in typed ? typed.method : "N/A";
          this.log(
            `[IPC Host] Message kind: ${typed.kind}, scope: ${typed.scope}, method: ${method}`,
            "WEBVIEW"
          );

          // Security: Validate message scope
          const validScopes: IpcScope[] = ["qdrantIndex", "webview-mgmt"];
          if (!validScopes.includes(typed.scope)) {
            this.log(
              `Received message with unknown scope: ${typed.scope}`,
              "WARN"
            );
            return;
          }

          // IPC Handler: Use type guards for stricter handling
          this.log(`[IPC Host] Routing message to handler...`, "WEBVIEW");
          if (typed.kind === "command") {
            this.log(`[IPC Host] Handling command: ${typed.method}`, "WEBVIEW");
            await this.handleCommand(typed as IpcCommand<any>);
          } else if (typed.kind === "request") {
            this.log(`[IPC Host] Handling request: ${typed.method}`, "WEBVIEW");
            await this.handleRequest(typed as IpcRequest<any>);
          } else if (typed.kind === "notification") {
            this.log(
              `[IPC Host] Handling notification: ${typed.method}`,
              "WEBVIEW"
            );
            await this.handleNotification(typed as IpcNotification<any>);
          }
          // Responses are typically handled by caller logic, not controller here
        },
        undefined,
        this._disposables
      );

      this._disposables.push(listener);

      this._analyticsService.trackEvent("provider.resolve.completed", {
        success: true,
        viewType: WebviewController.viewType,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Error in resolveWebviewView: ${errorMsg}`, "ERROR");
      this._analyticsService.trackError("provider.resolve.failed", errorMsg);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const serializedError = JSON.stringify({ message: errorMessage }).replace(
        /"/g,
        '\\"'
      );

      // Generate a nonce for the error page CSP
      const errorNonce = getNonce();

      webviewView.webview.options = {
        ...webviewView.webview.options,
        enableScripts: true,
      };

      webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'nonce-${errorNonce}' vscode-resource:; style-src vscode-resource:;">
  <title>Qdrant Code Search - Error</title>
</head>
<body style="font-family: sans-serif; padding:16px;">
  <h2>Qdrant Code Search - Debug Error</h2>
  <p>The sidebar view failed to initialize.</p>
  <pre style="background: #f5f5f5; padding: 8px; white-space: wrap;">${errorMessage}</pre>
  <button id="reload-btn">Reload Extension Window</button>
  <script nonce="${errorNonce}">
    (function() {
      var vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
      var reloadBtn = document.getElementById('reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
          if (vscode) {
            vscode.postMessage({ command: 'extension.reload' });
          }
        });
      }
      if (vscode) {
        vscode.postMessage({ command: 'debug.error', data: "${serializedError}" });
      }
    })();
  </script>
</body>
</html>`;

      this._analyticsService.trackEvent("provider.resolve.completed", {
        success: false,
        viewType: WebviewController.viewType,
      });

      vscode.window.showErrorMessage(
        `Failed to initialize Qdrant search view: ${errorMessage}`
      );
    }
  }

  // --- IPC Handlers ---
  private async handleCommand(command: IpcCommand<any>) {
    try {
      // Validate command structure
      if (!command || !command.method) {
        throw new Error("Invalid command structure: missing method");
      }

      switch (command.method) {
        case START_INDEX_METHOD:
          await this.handleIndexRequest();
          break;
        case OPEN_FILE_METHOD:
          await this.handleOpenFile(command as any); // !AI: TYPE - Dangerous type assertion, command may not be OpenFileCommand type
          break;
        case EXECUTE_COMMAND_METHOD:
          // !AI: CRITICAL SECURITY RISK - Arbitrary command execution from webview. Must whitelist 'command' and 'args' before calling executeCommand.
          await this.handleExecuteCommand(command as ExecuteCommand);
          break;
        case COPY_RESULTS_METHOD:
          await this.handleCopyResults(command.params as CopyResultsParams);
          break;

        // FIX 1: Handle ipc:ready-request (sent as kind: 'command' by App.tsx)
        case "ipc:ready-request": {
          this.log("Webview ready, sending initial status", "IPC");

          // Ensure indexing service is initialized for search
          const folder = this._workspaceManager.getActiveWorkspaceFolder();
          if (folder) {
            this.log(
              "[IPC] Ensuring IndexingService is initialized on webview ready",
              "WEBVIEW"
            );
            await this._indexingService.initializeForSearch(folder);
          }

          // Check actual status instead of hardcoding 'ready'
          const currentStatus = this._indexingService.isIndexing
            ? "indexing"
            : "ready";

          // Fetch stats
          const stats = await this._indexingService.getCollectionStats();

          this.sendNotification(INDEX_STATUS_METHOD, {
            status: currentStatus,
            stats: stats ?? undefined,
          });
          break;
        }

        // FIX 2: Handle update/preferences command
        case "update/preferences":
          this.log(
            `Received preferences update: ${JSON.stringify(command.params)}`,
            "CONFIG"
          );
          // Future: Persist these preferences if needed. For now, logging prevents the error.
          break;

        default:
          this.log(`Unknown command method: ${command.method}`, "IPC");
          throw new Error(`Unknown command method: ${command.method}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(
        `Error handling command ${command.method}: ${errorMsg}`,
        "ERROR"
      );
      this._analyticsService.trackError(
        "command_handler_failed",
        command.method
      );

      // Send error notification back to webview
      this.sendNotification("error", {
        type: "command_error",
        method: command.method,
        message: errorMsg,
      });
    }
  }

  private async handleRequest(
    request: IpcRequest<any>
  ): Promise<IpcResponse<any> | void> {
    this.log(
      `[IPC Host] handleRequest called for method: ${request.method}`,
      "WEBVIEW"
    );
    try {
      // Validate request structure
      if (!request || !request.method || !request.id) {
        this.log(`[IPC Host] Invalid request structure`, "ERROR");
        throw new Error("Invalid request structure: missing method or id");
      }

      this.log(
        `[IPC Host] Request validated, routing to handler...`,
        "WEBVIEW"
      );
      let response: IpcResponse<any> | undefined;
      switch (request.method) {
        case SEARCH_METHOD:
          this.log(`[IPC Host] Calling handleSearchRequest...`, "WEBVIEW");
          response = await this.handleSearchRequest(request);
          this.log(`[IPC Host] handleSearchRequest completed`, "WEBVIEW");
          break;
        case LOAD_CONFIG_METHOD:
          response = await this.handleLoadConfigRequest(request);
          break;
        case SAVE_CONFIG_METHOD:
          await this.handleSaveConfigRequest(
            request as IpcRequest<SaveConfigParams>
          );
          response = {
            kind: "response",
            scope: request.scope,
            id: crypto.randomUUID(),
            responseId: request.id,
            timestamp: Date.now(),
            data: { success: true },
          };
          break;
        case TEST_CONFIG_METHOD:
          response = await this.handleTestConfigRequest(
            request as IpcRequest<TestConfigParams>
          );
          break;
        case UPDATE_SEARCH_SETTINGS_METHOD:
          response = await this.handleUpdateSearchSettingsRequest(
            request as IpcRequest<UpdateSearchSettingsParams>
          );
          break;
        case GET_SEARCH_SETTINGS_METHOD:
          response = await this.handleGetSearchSettingsRequest(request);
          break;
        // FIX 3: Removed "ipc:ready-request" from here since it is a command, not a request
        default:
          this.log(`Unknown request method: ${request.method}`, "IPC");
          response = {
            kind: "response",
            scope: request.scope,
            id: crypto.randomUUID(),
            responseId: request.id,
            timestamp: Date.now(),
            error: `Unknown request method: ${request.method}`,
          };
          break;
      }

      if (response) {
        this.log(`[IPC Host] Sending response back to webview`, "WEBVIEW");
        this.sendResponse(response);
      } else {
        this.log(`[IPC Host] No response generated`, "WARN");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(
        `[IPC Host] Error handling request ${request.method}: ${errorMsg}`,
        "ERROR"
      );
      this._analyticsService.trackError(
        "request_handler_failed",
        request.method
      );

      // Send error response back to webview
      const errorResponse: IpcResponse<any> = {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        error: errorMsg,
      };
      this.log(`[IPC Host] Sending error response back to webview`, "ERROR");
      this.sendResponse(errorResponse);
    }
  }

  private async handleNotification(notification: IpcNotification<any>) {
    try {
      // Validate notification structure
      if (!notification || !notification.method) {
        throw new Error("Invalid notification structure: missing method");
      }

      switch (notification.method) {
        case INDEX_STATUS_METHOD:
          // Handle index status notifications
          if (
            notification.params &&
            typeof notification.params.status === "string"
          ) {
            this.log(
              `Received index status: ${notification.params.status}`,
              "IPC"
            );
          }
          break;
        case CONFIG_DATA_METHOD:
          // Handle configuration data notifications
          if (notification.params) {
            this.log("Received configuration data notification", "IPC");
          }
          break;
        case DID_CHANGE_CONFIG_NOTIFICATION:
          this.handleDidChangeConfiguration(
            notification as DidChangeConfigurationNotification
          );
          break;
        default:
          this.log(
            `Unknown notification method: ${notification.method}`,
            "IPC"
          );
          throw new Error(
            `Unknown notification method: ${notification.method}`
          );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(
        `Error handling notification ${notification.method}: ${errorMsg}`,
        "ERROR"
      );
      this._analyticsService.trackError(
        "notification_handler_failed",
        notification.method
      );

      // Send error notification back to webview
      this.sendNotification("error", {
        type: "notification_error",
        method: notification.method,
        message: errorMsg,
      });
    }
  }

  // --- Request Handlers ---
  private async handleIndexRequest() {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    if (!folder) {
      this.sendNotification(INDEX_STATUS_METHOD, { status: "no_workspace" });
      vscode.window.showErrorMessage("Please open a workspace folder first.");
      return;
    }

    this.sendNotification(INDEX_STATUS_METHOD, { status: "indexing" });
    try {
      await this._indexingService.startIndexing(folder);

      // Fetch stats after indexing completes
      const stats = await this._indexingService.getCollectionStats();

      this.sendNotification(INDEX_STATUS_METHOD, {
        status: "ready",
        stats: stats ?? undefined,
      });
    } catch (e) {
      this.sendNotification(INDEX_STATUS_METHOD, {
        status: "error",
        message: String(e),
      });
    }
  }

  private async handleCopyResults(params: CopyResultsParams): Promise<void> {
    const { mode, results } = params;

    // Group snippets by URI to avoid duplicates
    const byUri = new Map<string, FileSnippetResult[]>();
    for (const r of results) {
      const arr = byUri.get(r.uri) ?? [];
      arr.push(r);
      byUri.set(r.uri, arr);
    }

    if (byUri.size > 20) {
      const choice = await vscode.window.showWarningMessage(
        `Copying ${byUri.size} files may create a large payload. Continue?`,
        "Copy anyway",
        "Cancel"
      );
      if (choice !== "Copy anyway") return;
    }

    if (mode === "files") {
      // Use native file clipboard for file mode
      try {
        const filePaths = Array.from(byUri.keys()).map((uriString) => {
          const uri = vscode.Uri.parse(uriString);
          return uri.fsPath;
        });

        await this._clipboardService.copyFilesToClipboard(filePaths);
        this._analyticsService.trackEvent("results_copied", {
          mode,
          fileCount: byUri.size,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Failed to copy files: ${message}`, "ERROR");
        vscode.window.showErrorMessage(`Failed to copy files: ${message}`);
      }
    } else {
      // Snippet mode: copy as text
      let buffer = "";

      for (const [uriString, snippets] of byUri) {
        try {
          const uri = vscode.Uri.parse(uriString);
          const rel = vscode.workspace.asRelativePath(uri, false);

          buffer += `// File: ${rel}\n`;
          // Sort snippets by line number
          snippets.sort((a, b) => a.lineStart - b.lineStart);
          for (const s of snippets) {
            // Detect language from file extension for syntax highlighting
            const extension = rel.split(".").pop()?.toLowerCase();
            const language = this.getLanguageFromExtension(extension || "");

            buffer += `// Lines ${s.lineStart}-${s.lineEnd}\n`;
            buffer += `\`\`\`${language}\n`;
            buffer += `${s.snippet ?? ""}\n`;
            buffer += `\`\`\`\n\n`;
          }
        } catch {
          this.log(`Failed to read file for copy: ${uriString}`, "ERROR");
          buffer += `// File: ${uriString} (Error reading file)\n\n`;
        }
      }

      if (!buffer) {
        vscode.window.showInformationMessage("Qdrant: Nothing to copy.");
        return;
      }

      await vscode.env.clipboard.writeText(buffer);
      vscode.window.setStatusBarMessage(
        `Qdrant: Copied context from ${byUri.size} file(s)`,
        3000
      );
      this._analyticsService.trackEvent("results_copied", {
        mode,
        fileCount: byUri.size,
      });
    }
  }

  private async handleSearchRequest(
    request: IpcRequest<SearchRequestParams>
  ): Promise<IpcResponse<any>> {
    this.log(`[IPC Host] handleSearchRequest called`, "WEBVIEW");
    this.log(
      `[IPC Host] Request params: ${JSON.stringify(request.params)}`,
      "WEBVIEW"
    );
    try {
      // Enhanced parameter validation
      if (!request.params) {
        this.log(`[IPC Host] Missing request parameters`, "ERROR");
        throw new Error("Missing request parameters");
      }

      if (!request.params.query || typeof request.params.query !== "string") {
        this.log(
          `[IPC Host] Invalid or missing search query parameter`,
          "ERROR"
        );
        throw new Error("Invalid or missing search query parameter");
      }

      if (request.params.query.trim().length === 0) {
        this.log(`[IPC Host] Search query is empty`, "ERROR");
        throw new Error("Search query cannot be empty");
      }

      // Ensure indexing service is initialized for search
      const folder = this._workspaceManager.getActiveWorkspaceFolder();
      if (folder) {
        this.log(
          `[IPC Host] Ensuring IndexingService is initialized for search...`,
          "WEBVIEW"
        );
        const initSuccess = await this._indexingService.initializeForSearch(
          folder
        );
        if (!initSuccess) {
          this.log(
            `[IPC Host] Failed to initialize IndexingService for search`,
            "ERROR"
          );
          throw new Error(
            "Indexing service failed to initialize. Please check your configuration."
          );
        }
        this.log(
          `[IPC Host] IndexingService initialization verified`,
          "WEBVIEW"
        );
      } else {
        this.log(`[IPC Host] No workspace folder found`, "ERROR");
        throw new Error("No workspace folder found");
      }

      const query = request.params.query.trim();
      const limit = request.params.limit;
      this.log(
        `[IPC Host] Executing search for query: "${query}" with limit: ${limit}`,
        "SEARCH"
      );
      this.log(`[IPC Host] Calling indexingService.search()...`, "WEBVIEW");
      const searchResults = await this._indexingService.search(query, {
        limit,
      });
      this.log(`[IPC Host] indexingService.search() completed`, "WEBVIEW");

      // Transform SearchResultItem[] to FileSnippetResult[]
      const transformedResults: FileSnippetResult[] = searchResults.map(
        (item) => {
          const workspaceFolder =
            this._workspaceManager.getActiveWorkspaceFolder();
          const workspacePath = workspaceFolder?.uri.fsPath || "";

          // Construct full file path
          const fullPath = item.payload.filePath.startsWith("/")
            ? item.payload.filePath
            : `${workspacePath}/${item.payload.filePath}`;

          const uri = vscode.Uri.file(fullPath).toString();

          return {
            uri,
            filePath: item.payload.filePath,
            snippet: item.payload.content, // Map 'content' to 'snippet'
            lineStart: item.payload.lineStart,
            lineEnd: item.payload.lineEnd,
            score: item.score,
          };
        }
      );

      this._analyticsService.trackSearch({
        queryLength: query.length,
        resultsCount: transformedResults?.length || 0,
      });

      this.log(
        `[IPC Host] Search completed: ${
          transformedResults?.length || 0
        } results`,
        "SEARCH"
      );
      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        data: { results: transformedResults },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`[IPC Host] Search error: ${errorMsg}`, "ERROR");

      this._analyticsService.trackError("search_failed", "handleSearchRequest");

      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        error: `Search failed: ${errorMsg}`,
      };
    }
  }

  private async handleLoadConfigRequest(
    request: IpcRequest<any>
  ): Promise<IpcResponse<any>> {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    let config: QdrantOllamaConfig | null = null;
    if (folder) {
      config = await this._configService.loadQdrantConfig(folder);
    }

    return {
      kind: "response",
      scope: request.scope,
      id: crypto.randomUUID(),
      responseId: request.id,
      timestamp: Date.now(),
      data: config || null,
    };
  }

  private async handleSaveConfigRequest(
    request: IpcRequest<SaveConfigParams>
  ): Promise<void> {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    if (!folder) {
      throw new Error(
        "No active workspace folder found. Cannot save configuration."
      );
    }

    // Pass the useGlobal flag from the request to the service
    await this._configService.saveQdrantConfig(
      folder,
      request.params.config,
      request.params.useGlobal ?? false
    );

    vscode.window.showInformationMessage(
      `Qdrant configuration saved ${
        request.params.useGlobal ? "globally" : "locally"
      }.`
    );
  }

  private async handleTestConfigRequest(
    request: IpcRequest<TestConfigParams>
  ): Promise<IpcResponse<TestConfigResponse>> {
    // Call the new detailed validation
    const result = await this._configService.validateConnectionDetailed(
      request.params.config
    );

    return {
      kind: "response",
      scope: request.scope,
      id: crypto.randomUUID(),
      responseId: request.id,
      timestamp: Date.now(),
      data: result,
    };
  }

  private async handleUpdateSearchSettingsRequest(
    request: IpcRequest<UpdateSearchSettingsParams>
  ): Promise<IpcResponse<{ success: boolean }>> {
    try {
      const { limit, threshold } = request.params;

      // Update settings in VS Code configuration (global settings)
      if (limit !== undefined) {
        await this._configService.updateVSCodeSetting(
          "search.limit",
          limit,
          true
        );
      }
      if (threshold !== undefined) {
        await this._configService.updateVSCodeSetting(
          "search.threshold",
          threshold,
          true
        );
      }

      this.log(
        `Updated search settings: limit=${limit}, threshold=${threshold}`,
        "CONFIG"
      );

      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        data: { success: true },
      };
    } catch (error) {
      this.log(`Failed to update search settings: ${error}`, "ERROR");
      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleGetSearchSettingsRequest(
    request: IpcRequest<any>
  ): Promise<IpcResponse<GetSearchSettingsResponse>> {
    try {
      const config = this._configService.config;
      const searchSettings = {
        limit: config.search.limit,
        threshold: config.search.threshold,
      };

      this.log(
        `Retrieved search settings: ${JSON.stringify(searchSettings)}`,
        "CONFIG"
      );

      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        data: searchSettings,
      };
    } catch (error) {
      this.log(`Failed to get search settings: ${error}`, "ERROR");
      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleOpenFile(command: IpcCommand<OpenFileParams>) {
    try {
      // 1. Validate parameters
      if (!command.params) {
        throw new Error("Missing command parameters");
      }

      const { uri, line } = command.params;

      if (!uri || typeof uri !== "string") {
        throw new Error("Invalid or missing URI parameter");
      }

      // 2. Parse URI
      // The search result sends a serialized string via Uri.toString(), so we must use Uri.parse()
      // This handles 'file://' correctly on all OSs (Windows/Mac/Linux).
      const fileUri = vscode.Uri.parse(uri);

      // 3. Prepare Position (VS Code lines are 0-indexed)
      // Input 'line' is usually 1-indexed from the search result, so we subtract 1.
      const lineNumber = Math.max(0, (line || 1) - 1);
      const position = new vscode.Position(lineNumber, 0);
      const range = new vscode.Range(position, position);

      // 4. Open Document
      const doc = await vscode.workspace.openTextDocument(fileUri);

      // 5. Show Document
      // We pass the selection range directly in options for immediate highlighting
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false, // Open as persistent tab, not preview (italic)
        selection: range, // Set the cursor/selection immediately
      });

      // 6. Reveal Range
      // Force the editor to scroll the selected line into the center of the viewport
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      this.log(`Opened file ${uri} at line ${lineNumber + 1}`, "OPEN");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(
        `Failed to open file ${command.params?.uri || "unknown"}: ${errorMsg}`,
        "ERROR"
      );
      vscode.window.showErrorMessage(`Failed to open file. Error: ${errorMsg}`);
      this._analyticsService.trackError("open_file_failed", "handleOpenFile");
    }
  }

  private async handleExecuteCommand(command: ExecuteCommand) {
    try {
      // Enhanced parameter validation
      if (!command.params) {
        throw new Error("Missing command parameters");
      }

      if (
        !command.params.command ||
        typeof command.params.command !== "string"
      ) {
        throw new Error("Invalid or missing command parameter");
      }

      if (command.params.args && !Array.isArray(command.params.args)) {
        throw new Error("Command args must be an array");
      }

      await vscode.commands.executeCommand(
        command.params.command,
        ...(command.params.args || [])
      );
      this.log(`Executed VSCode command: ${command.params.command}`, "COMMAND");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(
        `Failed to execute command ${
          command.params?.command || "unknown"
        }: ${errorMsg}`,
        "ERROR"
      );
      vscode.window.showErrorMessage(
        `Failed to execute command: ${command.params?.command || "unknown"}`
      );
      this._analyticsService.trackError(
        "execute_command_failed",
        "handleExecuteCommand"
      );
    }
  }

  private handleDidChangeConfiguration(
    notification: DidChangeConfigurationNotification
  ) {
    this._analyticsService.trackEvent("settings_changed", {
      configKey: notification.params.configKey,
    });

    this.log(
      `Configuration changed for key: ${notification.params.configKey}`,
      "CONFIG"
    );
  }

  // --- Messaging Helpers ---

  public sendNotification(method: string, params: any) {
    if (this._view) {
      const notification = {
        scope: "qdrantIndex",
        id: crypto.randomUUID(),
        method: method,
        kind: "notification",
        params: params,
        timestamp: Date.now(),
      } as IpcNotification<any>;

      const notificationStr = JSON.stringify(notification);
      const notificationPreview =
        notificationStr.length > 200
          ? notificationStr.substring(0, 200) + "..."
          : notificationStr;

      this.log(`[IPC] Sending notification: ${method}`, "IPC");
      this.log(`[IPC] Notification data: ${notificationPreview}`, "IPC");

      try {
        this._view.webview.postMessage(notification);
        this.log(`[IPC] Notification sent successfully: ${method}`, "IPC");
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.log(
          `[IPC] Failed to send notification ${method}: ${err.message}`,
          "ERROR"
        );
        console.error(`[IPC] Notification send error:`, {
          message: err.message,
          stack: err.stack,
          method,
          timestamp: new Date().toISOString(),
        });

        // Special logging for network-related errors
        if (
          err.message.includes("ECONNRESET") ||
          err.message.includes("connection reset") ||
          err.message.includes("network") ||
          err.message.includes("fetch")
        ) {
          this.log(
            `[IPC] NETWORK ERROR in sendNotification - Type: ${err.name}, Message: ${err.message}`,
            "ERROR"
          );
          console.error(`[IPC] Network error details:`, {
            method,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } else {
      this.log(
        `[IPC] Cannot send notification ${method} - webview not available`,
        "WARN"
      );
    }
  }

  private sendResponse(response: IpcResponse<any>) {
    if (this._view) {
      const responseStr = JSON.stringify(response);
      const responsePreview =
        responseStr.length > 200
          ? responseStr.substring(0, 200) + "..."
          : responseStr;

      this.log(
        `[IPC] Sending response for request: ${response.responseId}`,
        "IPC"
      );
      this.log(`[IPC] Response data: ${responsePreview}`, "IPC");

      try {
        this._view.webview.postMessage(response);
        this.log(
          `[IPC] Response sent successfully for request: ${response.responseId}`,
          "IPC"
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.log(
          `[IPC] Failed to send response ${response.responseId}: ${err.message}`,
          "ERROR"
        );
        console.error(`[IPC] Response send error:`, {
          message: err.message,
          stack: err.stack,
          responseId: response.responseId,
          timestamp: new Date().toISOString(),
        });

        // Special logging for network-related errors
        if (
          err.message.includes("ECONNRESET") ||
          err.message.includes("connection reset") ||
          err.message.includes("network") ||
          err.message.includes("fetch")
        ) {
          this.log(
            `[IPC] NETWORK ERROR in sendResponse - Type: ${err.name}, Message: ${err.message}`,
            "ERROR"
          );
          console.error(`[IPC] Network error details:`, {
            responseId: response.responseId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } else {
      this.log(
        `[IPC] Cannot send response ${response.responseId} - webview not available`,
        "WARN"
      );
    }
  }

  // --- Telemetry & Context Keys ---

  public getTelemetryContext(): { [key: string]: string } {
    return {
      webviewVisible: this._isViewVisible.toString(),
      webviewFocused: this._isViewVisible.toString(),
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "out",
        "webview",
        "assets",
        "index.js"
      )
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "out",
        "webview",
        "assets",
        "index.css"
      )
    );

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Qdrant Search</title>
                <link href="${stylesUri}" rel="stylesheet" nonce="${nonce}">
            </head>
            <body>
                <div id="app"></div>
                <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
  }
}
