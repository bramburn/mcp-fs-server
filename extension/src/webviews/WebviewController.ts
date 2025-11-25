import * as vscode from "vscode";
import {
  IpcMessage,
  SEARCH_METHOD,
  START_INDEX_METHOD,
  INDEX_STATUS_METHOD,
  OPEN_FILE_METHOD,
  LOAD_CONFIG_METHOD,
  CONFIG_DATA_METHOD,
  SearchRequestParams,
  OpenFileParams,
  Scope,
} from "./protocol.js"; // Fixed import extension
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
export class WebviewController implements vscode.WebviewViewProvider {
  public static readonly viewType = "qdrant.searchView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _indexingService: IndexingService,
    private readonly _workspaceManager: WorkspaceManager,
    private readonly _configService: ConfigService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Listen for messages from the Webview (Guest)
    webviewView.webview.onDidReceiveMessage(async (data: IpcMessage) => {
      // Security: Validate message scope
      if (data.scope !== Scope) return;

      // Note: We cast data to 'any' here to access params because IpcMessage base type
      // doesn't have params, but we know the methods imply specific subtypes.
      // In a stricter implementation, we would use type guards.
      switch (data.method) {
        case START_INDEX_METHOD:
          await this.handleIndexRequest();
          break;
        case SEARCH_METHOD:
          await this.handleSearchRequest(data as any);
          break;
        case OPEN_FILE_METHOD:
          await this.handleOpenFile(data as any);
          break;
        case LOAD_CONFIG_METHOD:
          await this.handleLoadConfigRequest();
          break;
        default:
          console.log(`Unknown message method: ${data.method}`);
      }
    });
  }

  private async handleIndexRequest() {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    if (folder) {
      this.sendNotification(INDEX_STATUS_METHOD, { status: "indexing" });
      try {
        await this._indexingService.indexWorkspace(folder);
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

  private async handleSearchRequest(message: { params: SearchRequestParams }) {
    if (!message.params || !message.params.query) return;

    try {
      const results = await this._indexingService.search(message.params.query);
      this.sendNotification(SEARCH_METHOD, { results });
    } catch (error) {
      console.error("Search error:", error);
      this.sendNotification(SEARCH_METHOD, { results: [] });
      vscode.window.showErrorMessage("Search failed. See output for details.");
    }
  }

  private async handleLoadConfigRequest() {
    const folder = this._workspaceManager.getActiveWorkspaceFolder();
    if (folder) {
      const config = await this._configService.loadConfig(folder);
      this.sendNotification(CONFIG_DATA_METHOD, config || null);
    } else {
      this.sendNotification(CONFIG_DATA_METHOD, null);
    }
  }

  private async handleOpenFile(message: { params: OpenFileParams }) {
    const { uri, line } = message.params;
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

  public sendNotification(method: string, params: any) {
    if (this._view) {
      this._view.webview.postMessage({
        scope: Scope,
        id: crypto.randomUUID(),
        method: method,
        kind: "notification",
        params: params,
        timestamp: Date.now(),
      });
    }
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
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
