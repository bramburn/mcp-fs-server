import * as vscode from 'vscode';

// P0.1 & P0.3: Extension Entry and Contributions
export function activate(context: vscode.ExtensionContext) {
    console.log('Qdrant Code Search is now active!');

    // 1. Register Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(database) Qdrant: Ready";
    statusBarItem.tooltip = "Click to index workspace";
    statusBarItem.command = "qdrant.index.start";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 2. Register Webview Provider
    const provider = new QdrantSearchProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('qdrant.searchView', provider)
    );

    // 3. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('qdrant.index.start', () => {
            vscode.window.showInformationMessage('Starting Workspace Indexing...');
            // Trigger indexing service (P1.x)
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('qdrant.openSettings', () => {
             vscode.commands.executeCommand('workbench.action.openSettings', 'qdrant');
        })
    );
}

// Basic Webview Provider Implementation (Foundation for P2.1)
class QdrantSearchProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
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

export function deactivate() {}