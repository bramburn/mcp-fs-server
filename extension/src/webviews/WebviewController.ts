import * as vscode from "vscode";
import { AnalyticsService } from "../services/AnalyticsService.js";
import { ConfigService } from "../services/ConfigService.js";
import { IndexingService } from "../services/IndexingService.js";
import { ILogger } from "../services/LoggerService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";
import {
  CONFIG_DATA_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  DidChangeConfigurationNotification,
  EXECUTE_COMMAND_METHOD,
  ExecuteCommand,
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
  SEARCH_METHOD,
  SearchRequestParams,
  START_INDEX_METHOD,
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
    private readonly _logger: ILogger
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
      const safeLevel = ["INFO", "ERROR", "WARN", "FATAL"].includes(level) ? level : "INFO";
      this._logger.log(message, safeLevel);
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
    this.log(`🎯 resolveWebviewView called for ${WebviewController.viewType}`, "WEBVIEW");

    try {
      this._view = webviewView;
      this._analyticsService.trackPageView("search_view");

      vscode.commands.executeCommand("setContext", "qdrant.searchView.visible", true); // !AI: Future - 'setContext' is an internal command; consider using a public API if available for better stability across VS Code versions.

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
      this.log(`📝 Setting webview HTML, length: ${html.length} bytes`, "WEBVIEW");
      webviewView.webview.html = html;

      const listener = webviewView.webview.onDidReceiveMessage(
        async (data: any) => {
          const message: any = data;

          // Handle simple debug/fallback commands from error HTML
          if (message && typeof message.command === "string") {
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
          if (typed.kind === "command") {
            await this.handleCommand(typed as IpcCommand<any>);
          } else if (typed.kind === "request") {
            await this.handleRequest(typed as IpcRequest<any>);
          } else if (typed.kind === "notification") {
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
        default:
          this.log(`Unknown command method: ${command.method}`, "IPC");
          throw new Error(`Unknown command method: ${command.method}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Error handling command ${command.method}: ${errorMsg}`, "ERROR");
      this._analyticsService.trackError("command_handler_failed", command.method);
      
      // Send error notification back to webview
      this.sendNotification("error", {
        type: "command_error",
        method: command.method,
        message: errorMsg
      });
    }
  }

  private async handleRequest(
    request: IpcRequest<any>
  ): Promise<IpcResponse<any> | void> {
    try {
      // Validate request structure
      if (!request || !request.method || !request.id) {
        throw new Error("Invalid request structure: missing method or id");
      }

      let response: IpcResponse<any> | undefined;
      switch (request.method) {
        case SEARCH_METHOD:
          response = await this.handleSearchRequest(request);
          break;
        case LOAD_CONFIG_METHOD:
          response = await this.handleLoadConfigRequest(request);
          break;
        case "ipc:ready-request":
          this.log("Webview ready, sending initial status", "IPC");
          this.sendNotification(INDEX_STATUS_METHOD, { status: "ready" });
          break;
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
        this.sendResponse(response);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Error handling request ${request.method}: ${errorMsg}`, "ERROR");
      this._analyticsService.trackError("request_handler_failed", request.method);
      
      // Send error response back to webview
      const errorResponse: IpcResponse<any> = {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        error: errorMsg
      };
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
          if (notification.params && typeof notification.params.status === 'string') {
            this.log(`Received index status: ${notification.params.status}`, "IPC");
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
          this.log(`Unknown notification method: ${notification.method}`, "IPC");
          throw new Error(`Unknown notification method: ${notification.method}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Error handling notification ${notification.method}: ${errorMsg}`, "ERROR");
      this._analyticsService.trackError("notification_handler_failed", notification.method);
      
      // Send error notification back to webview
      this.sendNotification("error", {
        type: "notification_error",
        method: notification.method,
        message: errorMsg
      });
    }
  }

  // --- Request Handlers ---
  private async handleIndexRequest() {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    if (folder) {
      this.sendNotification(INDEX_STATUS_METHOD, { status: "indexing" });
      try {
        await this._indexingService.startIndexing(folder);
        this.sendNotification(INDEX_STATUS_METHOD, { status: "ready" });
      } catch (e) {
        this.sendNotification(INDEX_STATUS_METHOD, {
          status: "error",
          message: String(e),
        });
      }
    } else {
      vscode.window.showErrorMessage("No active workspace folder to index.");
    }
  }

  private async handleSearchRequest(
    request: IpcRequest<SearchRequestParams>
  ): Promise<IpcResponse<any>> {
    try {
      // Enhanced parameter validation
      if (!request.params) {
        throw new Error("Missing request parameters");
      }
      
      if (!request.params.query || typeof request.params.query !== 'string') {
        throw new Error("Invalid or missing search query parameter");
      }

      if (request.params.query.trim().length === 0) {
        throw new Error("Search query cannot be empty");
      }

      const query = request.params.query.trim();
      this.log(`Executing search for query: "${query}"`, "SEARCH");
      const results = await this._indexingService.search(query);

      this._analyticsService.trackSearch({
        queryLength: query.length,
        resultsCount: results?.length || 0,
      });

      this.log(`Search completed: ${results?.length || 0} results`, "SEARCH");
      return {
        kind: "response",
        scope: request.scope,
        id: crypto.randomUUID(),
        responseId: request.id,
        timestamp: Date.now(),
        data: { results },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Search error: ${errorMsg}`, "ERROR");

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

  private async handleOpenFile(command: IpcCommand<OpenFileParams>) {
    try {
      // Enhanced parameter validation
      if (!command.params) {
        throw new Error("Missing command parameters");
      }
      
      const { uri, line } = command.params;
      
      if (!uri || typeof uri !== 'string') {
        throw new Error("Invalid or missing URI parameter");
      }
      
      if (line !== undefined && (typeof line !== 'number' || line < 0)) {
        throw new Error("Invalid line parameter - must be a non-negative number");
      }

      let fileUri: vscode.Uri;

      // Handle different URI schemes properly
      if (uri.startsWith("vscode-userdata:")) {
        this.log(`Skipping vscode-userdata URI: ${uri}`, "WARN");
        vscode.window.showInformationMessage(
          `Cannot open VS Code user data files: ${uri}`
        );
        return;
      } else if (uri.startsWith("/") || uri.match(/^[a-zA-Z]:/)) {
        fileUri = vscode.Uri.file(uri);
      } else if (uri.startsWith("file://")) {
        fileUri = vscode.Uri.parse(uri);
      } else {
        try {
          fileUri = vscode.Uri.parse(uri);
        } catch {
          fileUri = vscode.Uri.file(uri);
        }
      }

      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc);
      // !AI: Line number mapping: (line || 1) - 1 correctly maps 1-based input to 0-based index, but if line=0 is passed, it maps to line 0. If user input is strictly 1-based, line=0 should be rejected by validation.
      const position = new vscode.Position(Math.max(0, (line || 1) - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
      this.log(`Opened file ${uri} at line ${line || 1}`, "OPEN");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Failed to open file ${command.params?.uri || 'unknown'}: ${errorMsg}`, "ERROR");
      vscode.window.showErrorMessage(`Failed to open file: ${command.params?.uri || 'unknown'}`);
      this._analyticsService.trackError("open_file_failed", "handleOpenFile");
    }
  }

  private async handleExecuteCommand(command: ExecuteCommand) {
    try {
      // Enhanced parameter validation
      if (!command.params) {
        throw new Error("Missing command parameters");
      }
      
      if (!command.params.command || typeof command.params.command !== 'string') {
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
        `Failed to execute command ${command.params?.command || 'unknown'}: ${errorMsg}`,
        "ERROR"
      );
      vscode.window.showErrorMessage(
        `Failed to execute command: ${command.params?.command || 'unknown'}`
      );
      this._analyticsService.trackError("execute_command_failed", "handleExecuteCommand");
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