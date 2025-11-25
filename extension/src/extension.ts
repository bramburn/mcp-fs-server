import * as vscode from 'vscode';

// P0.1 & P0.3: Extension Entry and Contributions
export function activate(context: vscode.ExtensionContext) {
    console.log('Qdrant Code Search is now active!');
    // !AI: Assumption: Indexing service is not yet instantiated or registered for command execution. MVP requires service setup here.

    // 1. Register Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(database) Qdrant: Ready";
    statusBarItem.tooltip = "Click to index workspace";
    // !AI: Scope Gap: Status bar item is linked to a command, but the command handler on line 24 does not seem to be aware of or interact with any state management for the status bar item itself (e.g., changing text to 'Indexing...').
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
            // !AI: Workflow Gap: Command triggers indexing start but lacks actual communication/IPC to the IndexingService or Webview Controller to initiate work and update status.
            // Trigger indexing service (P1.x)
        })
    );
    
    context.subscriptions.push(
        })
    );
    // !AI: Assumption: The 'qdrant' settings scope is correctly defined in package.json (contributions.configuration) for this command to open the right section.
        vscode.commands.registerCommand('qdrant.openSettings', () => {
             vscode.commands.executeCommand('workbench.action.openSettings', 'qdrant');
        })
    );
}
        // !AI: Scope Gap: WebviewViewProvider implementation is missing logic to set up `webviewView.webview.onDidReceiveMessage` listeners, which is crucial for receiving data/commands from the webview UI.

// Basic Webview Provider Implementation (Foundation for P2.1)
class QdrantSearchProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // !AI: Workflow Gap: No logic exists here to send initial state/configuration data to the webview upon load, which might be necessary for UI initialization (e.g., search context, settings).
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
                <script type="module" src="${scriptUri}"></script>
                <script>
                    // !AI: Data Structure Issue: The HTML/JS setup must correctly assume and bind to the VS Code API exposed via `vscode.postMessage` and `vscode.acquireVsCodeApi()` for IPC, which is not visible here.
export function deactivate() {
    // !AI: Scope Gap: No cleanup logic is defined here. MVP should ensure services or event listeners are properly disposed of upon extension deactivation.
}
                </script>
            </body>
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