import * as vscode from 'vscode';
import { WebviewController } from './webviews/WebviewController.js';
import { IndexingService } from './services/IndexingService.js';
import { ConfigService } from './services/ConfigService.js';
import { WorkspaceManager } from './services/WorkspaceManager.js';

let indexingService: IndexingService;
let configService: ConfigService;
let workspaceManager: WorkspaceManager;
let webviewController: WebviewController;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Qdrant Code Search extension is now active!');

    // Initialize services
    configService = new ConfigService(context);
    indexingService = new IndexingService(configService, context);
    workspaceManager = new WorkspaceManager(context, configService, indexingService);

    // Initialize workspace manager
    await workspaceManager.initialize();

    // Create webview controller
    webviewController = new WebviewController(
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
                await indexingService.indexWorkspace(folder);
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

export function deactivate() {
    // Cleanup will be handled by VS Code
}