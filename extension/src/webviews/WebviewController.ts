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
  WebviewReadyRequest,
  ExecuteCommand,
  DidChangeConfigurationNotification,
  WEBVIEW_READY_METHOD,
  EXECUTE_COMMAND_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  IpcScope,
  QdrantOllamaConfig,
} from "./protocol.js";
import { IndexingService } from "../services/IndexingService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";
import { ConfigService } from "../services/ConfigService.js";

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
  public static readonly viewType = "qdrant.searchView";
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _isViewVisible: boolean = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _indexingService: IndexingService,
    private readonly _workspaceManager: WorkspaceManager,
    private readonly _configService: ConfigService
  ) {}

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
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // 5. Context Keys: Set visible context key on view creation
    vscode.commands.executeCommand('setContext', 'qdrant.searchView.visible', true);

    // Correctly handle webview visibility changes
    webviewView.onDidChangeVisibility(() => {
        this._isViewVisible = webviewView.visible;
        vscode.commands.executeCommand('setContext', 'qdrant.searchView.focused', webviewView.visible); // Assuming focused when visible
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
      async (data: IpcMessage) => {
        // Security: Validate message scope
        // IpcScope is a union type, direct Object.values() won't work.
        // Instead, we ensure the data.scope is one of the valid literal strings.
        const validScopes: IpcScope[] = ['qdrantIndex', 'webview-mgmt'];
        if (!validScopes.includes(data.scope)) {
            console.warn(`Received message with unknown scope: ${data.scope}`);
            return;
        }

        // 5. IPC Handler: Use type guards for stricter handling
        if (data.kind === 'command') {
            await this.handleCommand(data as IpcCommand<any>);
        } else if (data.kind === 'request') {
            await this.handleRequest(data as IpcRequest<any>);
        } else if (data.kind === 'notification') {
            await this.handleNotification(data as IpcNotification<any>);
        }
        // Responses are typically handled by caller logic, not controller here
      },
      undefined,
      this._disposables
    );

    // Add listeners/disposables here
    this._disposables.push(listener);
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
        console.log(`Unknown command method: ${command.method}`);
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
      default:
        console.log(`Unknown request method: ${request.method}`);
        response = { // Send error response for unknown request
            kind: 'response',
            scope: request.scope,
            id: vscode.env.createUuid(),
            responseId: request.id,
            timestamp: Date.now(),
            error: `Unknown request method: ${request.method}`
        };
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
            console.log(`Unknown notification method: ${notification.method}`);
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
            id: vscode.env.createUuid(),
            responseId: request.id,
            timestamp: Date.now(),
            error: "Missing search query."
        };
    }

    try {
      const results = await this._indexingService.search(request.params.query);
      return {
          kind: 'response',
          scope: request.scope,
          id: vscode.env.createUuid(),
          responseId: request.id,
          timestamp: Date.now(),
          data: { results }
      };
    } catch (error) {
      console.error("Search error:", error);
      return {
          kind: 'response',
          scope: request.scope,
          id: crypto.randomUUID(),
          responseId: request.id,
          timestamp: Date.now(),
          error: `Search failed: ${String(error)}`
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
      id: vscode.env.createUuid(),
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
    } catch (error) {
      console.error(`Failed to open file: ${uri}`, error);
      vscode.window.showErrorMessage(`Failed to open file: ${uri}`);
    }
  }

  private async handleExecuteCommand(command: ExecuteCommand) {
    try {
        await vscode.commands.executeCommand(command.params.command, ...(command.params.args || []));
    } catch (error) {
        console.error(`Failed to execute command ${command.params.command}:`, error);
        vscode.window.showErrorMessage(`Failed to execute command: ${command.params.command}`);
    }
  }

  private handleDidChangeConfiguration(notification: DidChangeConfigurationNotification) {
    // Placeholder for logic to react to configuration changes (e.g., reloading a service)
    console.log(`Configuration changed for key: ${notification.params.configKey}`);
  }

  // --- Messaging Helpers ---

  public sendNotification(method: string, params: any) {
    if (this._view) {
      this._view.webview.postMessage({
        scope: 'qdrantIndex', // Explicitly cast to IpcScope if necessary, or ensure 'qdrantIndex' is within the union
        id: vscode.env.createUuid(),
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


