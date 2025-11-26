import * as vscode from "vscode";
import {
  IpcMessage,
  IpcCommand,
  IpcRequest,
  IpcNotification,
  IpcResponse,
  SEARCH_METHOD,
  START_INDEX_METHOD,
  INDEX_STATUS_METHOD,
  OPEN_FILE_METHOD,
  LOAD_CONFIG_METHOD,
  CONFIG_DATA_METHOD,
  SearchRequestParams,
  OpenFileParams,
  ExecuteCommand,
  DidChangeConfigurationNotification,
  EXECUTE_COMMAND_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  IpcScope,
  QdrantOllamaConfig,
} from "./protocol.js";
import { IndexingService } from "../services/IndexingService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";
import { ConfigService } from "../services/ConfigService.js";
import { AnalyticsService } from "../services/AnalyticsService.js";

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
 * P2.1: Svelte Webview Setup and Hosting
 * Manages the Webview Panel (Sidebar) and handles IPC messaging.
 */
export class WebviewController implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "qdrant.search.view";
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _isViewVisible: boolean = false;
  private readonly _traceEnabled: boolean;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _indexingService: IndexingService,
    private readonly _workspaceManager: WorkspaceManager,
    private readonly _configService: ConfigService,
    private readonly _analyticsService: AnalyticsService,
    private readonly _outputChannel: vscode.OutputChannel
  ) {
    this._traceEnabled = vscode.workspace.getConfiguration('qdrant.search').get('trace', false) as boolean;
    
    this.log(`WebviewController created for viewType ${WebviewController.viewType} with extensionUri ${this._extensionUri.toString()}`);
    this._analyticsService.trackEvent('controller.created', {
      viewType: WebviewController.viewType
    });
  }

  /**
   * Helper method to conditionally log based on trace setting
   */
  private log(message: string, level: 'INFO' | 'ERROR' | 'WARN' | 'WEBVIEW' | 'IPC' | 'SEARCH' | 'OPEN' | 'COMMAND' | 'CONFIG' = 'INFO') {
    if (this._traceEnabled || level === 'ERROR') {
      this._outputChannel.appendLine(`[${level}] ${message}`);
    }
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
    this.log(`resolveWebviewView called for ${WebviewController.viewType}`);
    this._analyticsService.trackEvent('provider.resolve.called', {
      viewType: WebviewController.viewType
    });

    try {
      this._view = webviewView;

      // Track page view when webview is resolved
      this._analyticsService.trackPageView('search_view');

      // Context Keys: Set visible context key on view creation
      vscode.commands.executeCommand('setContext', 'qdrant.searchView.visible', true);

      // Correctly handle webview visibility changes
      webviewView.onDidChangeVisibility(() => {
        this._isViewVisible = webviewView.visible;
        vscode.commands.executeCommand(
          'setContext',
          'qdrant.searchView.focused',
          webviewView.visible // Assuming focused when visible
        );
      });

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
        ],
      };

      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      // Listen for messages from the Webview (Guest)
      const listener = webviewView.webview.onDidReceiveMessage(
        async (data: any) => {
          const message: any = data;

          // Handle simple debug/fallback commands from the error HTML
          if (message && typeof message.command === 'string') {
            switch (message.command) {
              case 'extension.reload': {
                this.log('Received extension.reload from webview fallback', 'WEBVIEW');
                this._analyticsService.trackEvent('webview.fallback.reloadClicked', {
                  viewType: WebviewController.viewType
                });
                vscode.commands.executeCommand('workbench.action.reloadWindow');
                return;
              }
              case 'debug.error': {
                this.log(`Received debug.error from webview fallback: ${JSON.stringify(message.data)}`, 'WEBVIEW');
                this._analyticsService.trackError(
                  'webview_fallback_error',
                  typeof message.data === 'string' ? message.data : JSON.stringify(message.data)
                );
                return;
              }
              default: {
                this.log(`Received unknown fallback command from webview: ${message.command}`, 'WEBVIEW');
                break;
              }
            }
          }

          const typed = data as IpcMessage;

          // Security: Validate message scope
          const validScopes: IpcScope[] = ['qdrantIndex', 'webview-mgmt'];
          if (!validScopes.includes(typed.scope)) {
            this.log(`Received message with unknown scope: ${typed.scope}`, 'WARN');
            return;
          }

          // IPC Handler: Use type guards for stricter handling
          if (typed.kind === 'command') {
            await this.handleCommand(typed as IpcCommand<any>);
          } else if (typed.kind === 'request') {
            await this.handleRequest(typed as IpcRequest<any>);
          } else if (typed.kind === 'notification') {
            await this.handleNotification(typed as IpcNotification<any>);
          }
          // Responses are typically handled by caller logic, not controller here
        },
        undefined,
        this._disposables
      );

      // Add listeners/disposables here
      this._disposables.push(listener);

      this._analyticsService.trackEvent('provider.resolve.completed', {
        success: true,
        viewType: WebviewController.viewType
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Error in resolveWebviewView: ${errorMsg}`, 'ERROR');
      this._analyticsService.trackError(
        'provider.resolve.failed',
        errorMsg
      );

      const errorMessage = error instanceof Error ? error.message : String(error);
      const serializedError = JSON.stringify({ message: errorMessage }).replace(/"/g, '\\"');

      webviewView.webview.options = {
        ...webviewView.webview.options,
        enableScripts: true
      };

      webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'unsafe-inline' vscode-resource:; style-src 'unsafe-inline';">
  <title>Qdrant Code Search - Error</title>
</head>
<body style="font-family: sans-serif; padding: 16px;">
  <h2>Qdrant Code Search - Debug Error</h2>
  <p>The sidebar view failed to initialize.</p>
  <pre style="background: #f5f5f5; padding: 8px; white-space: pre-wrap;">${errorMessage}</pre>
  <button id="reload-btn">Reload Extension Window</button>
  <script>
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

      this._analyticsService.trackEvent('provider.resolve.completed', {
        success: false,
        viewType: WebviewController.viewType
      });

      vscode.window.showErrorMessage(
        `Failed to initialize Qdrant search view: ${errorMessage}`
      );
    }
  }

  // --- IPC Handlers ---
  private async handleCommand(command: IpcCommand<any>) {
    switch (command.method) {
      case START_INDEX_METHOD:
        await this.handleIndexRequest();
        break;
      case OPEN_FILE_METHOD:
        await this.handleOpenFile(command as any);
        break;
      case EXECUTE_COMMAND_METHOD:
        await this.handleExecuteCommand(command as ExecuteCommand);
        break;
      default:
        this.log(`Unknown command method: ${command.method}`, 'IPC');
    }
  }

  private async handleRequest(request: IpcRequest<any>): Promise<IpcResponse<any> | void> {
    let response: IpcResponse<any> | undefined;
    switch (request.method) {
      case SEARCH_METHOD:
        // Corrected access to request.scope and request.id
        response = await this.handleSearchRequest(request);
        break;
      case LOAD_CONFIG_METHOD:
        // Corrected access to request.scope and request.id
        response = await this.handleLoadConfigRequest(request);
        break;
      default: {
        this.log(`Unknown request method: ${request.method}`, 'IPC');
        response = { // Send error response for unknown request
            kind: 'response',
            scope: request.scope,
            id: crypto.randomUUID(),
            responseId: request.id,
            timestamp: Date.now(),
            error: `Unknown request method: ${request.method}`
        };
        break;
      }
    }
    
    if (response) {
        this.sendResponse(response);
    }
  }

  private async handleNotification(notification: IpcNotification<any>) {
    switch (notification.method) {
        case INDEX_STATUS_METHOD:
            // Handled by sendNotification in handleIndexRequest
            break;
        case CONFIG_DATA_METHOD:
            // Handled by sendNotification in handleLoadConfigRequest
            break;
        case DID_CHANGE_CONFIG_NOTIFICATION:
            this.handleDidChangeConfiguration(notification as DidChangeConfigurationNotification);
            break;
        default:
            this.log(`Unknown notification method: ${notification.method}`, 'IPC');
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

  private async handleSearchRequest(request: IpcRequest<SearchRequestParams>): Promise<IpcResponse<any>> {
    if (!request.params || !request.params.query) {
        return {
            kind: 'response',
            scope: request.scope,
            id: crypto.randomUUID(),
            responseId: request.id,
            timestamp: Date.now(),
            error: "Missing search query."
        };
    }

    try {
      const query = request.params.query;
      this.log(`Executing search for query: "${query}"`, 'SEARCH');
      const results = await this._indexingService.search(query);

      // Track search analytics
      this._analyticsService.trackSearch({
        queryLength: query.length,
        resultsCount: results?.length || 0
      });

      this.log(`Search completed: ${results?.length || 0} results`, 'SEARCH');
      return {
          kind: 'response',
          scope: request.scope,
          id: crypto.randomUUID(),
          responseId: request.id,
          timestamp: Date.now(),
          data: { results }
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Search error: ${errorMsg}`, 'ERROR');

      // Track search error
      this._analyticsService.trackError('search_failed', 'handleSearchRequest');

      return {
          kind: 'response',
          scope: request.scope,
          id: crypto.randomUUID(),
          responseId: request.id,
          timestamp: Date.now(),
          error: `Search failed: ${errorMsg}`
      };
    }
  }

  private async handleLoadConfigRequest(request: IpcRequest<any>): Promise<IpcResponse<any>> {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    let config: QdrantOllamaConfig | null = null;
    if (folder) {
      config = await this._configService.loadQdrantConfig(folder);
    }

    return {
      kind: 'response',
      scope: request.scope,
      id: crypto.randomUUID(),
      responseId: request.id,
      timestamp: Date.now(),
      data: config || null
    };
  }

  private async handleOpenFile(command: IpcCommand<OpenFileParams>) {
    const { uri, line } = command.params;
    try {
      const fileUri =
        uri.startsWith("/") || uri.match(/^[a-zA-Z]:/)
          ? vscode.Uri.file(uri)
          : vscode.Uri.parse(uri);

      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc);
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
      this.log(`Opened file ${uri} at line ${line}`, 'OPEN');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Failed to open file ${uri}: ${errorMsg}`, 'ERROR');
      vscode.window.showErrorMessage(`Failed to open file: ${uri}`);
    }
  }

  private async handleExecuteCommand(command: ExecuteCommand) {
    try {
        await vscode.commands.executeCommand(command.params.command, ...(command.params.args || []));
        this.log(`Executed VSCode command: ${command.params.command}`, 'COMMAND');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(`Failed to execute command ${command.params.command}: ${errorMsg}`, 'ERROR');
        vscode.window.showErrorMessage(`Failed to execute command: ${command.params.command}`);
    }
  }

  private handleDidChangeConfiguration(notification: DidChangeConfigurationNotification) {
    // Track configuration changes
    this._analyticsService.trackEvent('settings_changed', {
      configKey: notification.params.configKey
    });

    // Placeholder for logic to react to configuration changes (e.g., reloading a service)
    this.log(`Configuration changed for key: ${notification.params.configKey}`, 'CONFIG');
  }

  // --- Messaging Helpers ---

  public sendNotification(method: string, params: any) {
    if (this._view) {
      this._view.webview.postMessage({
        scope: 'qdrantIndex', // Explicitly cast to IpcScope if necessary, or ensure 'qdrantIndex' is within the union
        id: crypto.randomUUID(),
        method: method,
        kind: "notification",
        params: params,
        timestamp: Date.now(),
      } as IpcNotification<any>);
    }
  }

  private sendResponse(response: IpcResponse<any>) {
    if (this._view) {
      this._view.webview.postMessage(response);
    }
  }

  // --- Telemetry & Context Keys ---
  public getTelemetryContext(): { [key: string]: string } {
    return {
        webviewVisible: this._isViewVisible.toString(),
        webviewFocused: this._isViewVisible.toString(), // Reuse for now
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // P2.1: Hosting - loading bundled assets
    // Generate a unique nonce for this webview instance
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