import * as vscode from "vscode";
import { AnalyticsService } from "../services/AnalyticsService.js";
import { ClipboardService } from "../services/ClipboardService.js";
import { ConfigService } from "../services/ConfigService.js";
import { IndexingService } from "../services/IndexingService.js";
import { ILogger } from "../services/LoggerService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";
import { DID_CHANGE_CONFIG_NOTIFICATION, IpcMessage } from "./protocol.js";

// IPC Infrastructure
import { ConfigHandler } from "./handlers/ConfigHandler.js";
import { FileHandler } from "./handlers/FileHandler.js";
import { IndexHandler } from "./handlers/IndexHandler.js";
import { SearchHandler } from "./handlers/SearchHandler.js";
import { IpcContext, IpcRouter } from "./ipc/IpcRouter.js";

/**
 * P2.1 Refactor: Decoupled Webview Controller
 * Manages the Webview Panel lifecycle and delegates IPC messages to the Router.
 */
export class WebviewController
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = "qdrant.search.view";
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _ipcRouter: IpcRouter;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _indexingService: IndexingService,
    private readonly _workspaceManager: WorkspaceManager,
    private readonly _configService: ConfigService,
    private readonly _analyticsService: AnalyticsService,
    private readonly _logger: ILogger,
    private readonly _clipboardService: ClipboardService
  ) {
    this._ipcRouter = new IpcRouter(_logger);
    this.registerHandlers();
  }

  private registerHandlers() {
    // 1. Search Handler
    this._ipcRouter.registerHandler(
      new SearchHandler(
        this._indexingService,
        this._workspaceManager,
        this._configService,
        this._analyticsService
      )
    );

    // 2. Config Handler
    this._ipcRouter.registerHandler(new ConfigHandler(this._configService));

    // 3. File/System Handler (Copy, Open, Execute)
    this._ipcRouter.registerHandler(
      new FileHandler(
        this._clipboardService,
        this._analyticsService,
        this._logger
      )
    );

    // 4. Index Handler (Start Indexing, Status)
    this._ipcRouter.registerHandler(
      new IndexHandler(this._indexingService, this._workspaceManager)
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    this._analyticsService.trackPageView("search_view");

    // Setup Options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
      ],
    };

    // Render HTML
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Create a Context for Handlers to communicate back to this specific webview
    const context: IpcContext = {
      postMessage: (msg) => webviewView.webview.postMessage(msg),
      log: (msg, level) => this._logger.log(msg, level),
    };

    // Listen for messages
    const listener = webviewView.webview.onDidReceiveMessage(
      async (data: IpcMessage) => {
        await this._ipcRouter.routeMessage(data, context);
      },
      undefined,
      this._disposables
    );

    this._disposables.push(listener);
    this.setupConfigListeners(context);
  }

  private setupConfigListeners(context: IpcContext) {
    // Listen for global config changes and notify webview
    // We bind this here because it requires the specific webview instance context
    this._configService.addConfigurationChangeListener((e) => {
      // Just forward the notification to the webview
      if (this._view) {
        context.postMessage({
          kind: "notification",
          id: crypto.randomUUID(),
          scope: "webview-mgmt",
          method: DID_CHANGE_CONFIG_NOTIFICATION,
          timestamp: Date.now(),
          params: {
            configKey: e.section,
            value: e.value,
          },
        });
      }
    });
  }

  public dispose() {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) disposable.dispose();
    }
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

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
