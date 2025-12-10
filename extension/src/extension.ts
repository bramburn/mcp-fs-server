import * as vscode from 'vscode';
import { Container } from './container/Container.js';
import { WebviewController } from './webviews/WebviewController.js';

let container: Container | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const start = Date.now();
    
    // 1. Create Output Channel for Logging
    const outputChannel = vscode.window.createOutputChannel("Qdrant Code Search");
    outputChannel.show(true); // Show it on startup for debugging
    outputChannel.appendLine(`[${new Date().toISOString()}] --------------------------------------------------`);
    outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Starting extension activation...`);
    console.log('[Qdrant] ACTIVATE: Starting extension activation...');

    try {
        // 2. Initialize Dependency Injection Container
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Initializing Service Container...`);
        
        // Pass 'true' for traceEnabled to ensure verbose logging during debug
        container = Container.create(context, outputChannel, true);
        
        context.subscriptions.push(container);
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Service Container created.`);

        // 3. Register Webview Provider
        // This connects the 'qdrant.search.view' in package.json to your WebviewController
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Registering WebviewViewProvider for type '${WebviewController.viewType}'...`);
        
        const viewRegistration = vscode.window.registerWebviewViewProvider(
            WebviewController.viewType,
            container.webviewController,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        
        context.subscriptions.push(viewRegistration);
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: WebviewViewProvider registered.`);

        // 4. Wait for Container Readiness (optional, but good for health checks)
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Awaiting container readiness...`);
        await container.ready;
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Container is ready.`);

        // 5. Register Commands
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Registering commands...`);
        
        const openSettingsCmd = vscode.commands.registerCommand('qdrant.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'semanticSearch');
        });
        context.subscriptions.push(openSettingsCmd);

        const indexWorkspaceCmd = vscode.commands.registerCommand('qdrant.index.start', async () => {
            if (container) {
                await container.indexingService.startIndexing();
            } else {
                vscode.window.showErrorMessage("Qdrant Search extension is not initialized.");
            }
        });
        context.subscriptions.push(indexWorkspaceCmd);

        const duration = Date.now() - start;
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Extension activated successfully in ${duration}ms`);
        console.log(`[Qdrant] ACTIVATE: Extension activated successfully in ${duration}ms`);

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        
        outputChannel.appendLine(`[${new Date().toISOString()}] CRITICAL ERROR during activation: ${msg}`);
        outputChannel.appendLine(`[${new Date().toISOString()}] Stack Trace: ${stack}`);
        console.error('[Qdrant] CRITICAL ERROR during activation:', error);
        
        vscode.window.showErrorMessage(`Qdrant Code Search failed to load: ${msg}`);
        // Re-throw to let VS Code know activation failed
        throw error;
    }
}

export function deactivate() {
    console.log('[Qdrant] DEACTIVATE: Extension deactivating...');
    if (container) {
        container.dispose();
        container = undefined;
    }
}