import * as vscode from 'vscode';
import { 
    IpcMessage, 
    SEARCH_METHOD, 
    START_INDEX_METHOD, 
    INDEX_STATUS_METHOD, 
    SearchRequestParams,
    Scope 
} from './protocol';
import { IndexingService } from '../services/IndexingService';
import { WorkspaceManager } from '../services/WorkspaceManager';

/**
 * Manages the Webview Panel (Sidebar) and handles IPC messaging.
 */
export class WebviewController implements vscode.WebviewViewProvider {
    public static readonly viewType = 'qdrant.searchView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _indexingService: IndexingService,
        private readonly _workspaceManager: WorkspaceManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the Webview (Guest)
        webviewView.webview.onDidReceiveMessage(async (data: IpcMessage) => {
            if (data.scope !== Scope) return;

            switch (data.method) {
                case START_INDEX_METHOD:
                    await this.handleIndexRequest();
                    break;
                case SEARCH_METHOD:
                    await this.handleSearchRequest(data as any);
                    break;
                default:
                    console.log(`Unknown message method: ${data.method}`);
            }
        });
    }

    private async handleIndexRequest() {
        const folder = this._workspaceManager.getActiveWorkspaceFolder();
        if (folder) {
            this.sendNotification(INDEX_STATUS_METHOD, { status: 'indexing' });
            await this._indexingService.indexWorkspace(folder);
            this.sendNotification(INDEX_STATUS_METHOD, { status: 'ready' });
        } else {
            vscode.window.showErrorMessage('No active workspace folder to index.');
        }
    }

    private async handleSearchRequest(message: { params: SearchRequestParams }) {
        // Mock response for P1
        console.log(`Searching for: ${message.params.query}`);
        // In P2, we will return real results via postMessage
    }

    public sendNotification(method: string, params: any) {
        if (this._view) {
            this._view.webview.postMessage({
                scope: Scope,
                id: crypto.randomUUID(),
                method: method,
                kind: 'notification',
                params: params,
                timestamp: Date.now()
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js')
        );
        const stylesUri = webview.asWebviewUri(
             vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Qdrant Search</title>
                <link href="${stylesUri}" rel="stylesheet">
            </head>
            <body>
                <div id="app"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}