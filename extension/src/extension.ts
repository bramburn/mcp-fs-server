import * as vscode from 'vscode';
import { WebviewController } from './webviews/WebviewController.js';
import { initializeServices, useService, Container } from './container/Container.js';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Qdrant Code Search extension is now active!');

    // Initialize DI container with all services
    initializeServices(context);

    // Get services via container (lazy initialization with proper dependency resolution)
    const configService = useService('ConfigService');
    const indexingService = useService('IndexingService');
    const workspaceManager = useService('WorkspaceManager');

    // Create webview controller
    const webviewController = new WebviewController(
        context.extensionUri,
        indexingService,
        workspaceManager,
        configService
    );

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            WebviewController.viewType,
            webviewController
        )
    );

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(database) Qdrant: Ready";
    statusBarItem.tooltip = "Qdrant Code Search Status";
    statusBarItem.command = "qdrant.openSettings";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('qdrant.index.start', async () => {
            const folder = workspaceManager.getActiveWorkspaceFolder();
            if (!folder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // Update status
            statusBarItem.text = "$(sync~spin) Qdrant: Indexing...";

            try {
                await indexingService.startIndexing(folder);
                statusBarItem.text = "$(database) Qdrant: Ready";
                vscode.window.showInformationMessage('Workspace indexed successfully!');
            } catch (error) {
                statusBarItem.text = "$(database) Qdrant: Error";
                vscode.window.showErrorMessage(`Indexing failed: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('qdrant.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'qdrant');
        })
    );

    // Send initial status to webview
    webviewController.sendNotification('index/status', { status: 'ready' });
}

export async function deactivate() {
    // Properly dispose all services in reverse dependency order
    await Container.instance.dispose();
}