import * as vscode from 'vscode';
import { WebviewController } from './webviews/WebviewController.js';
import { initializeServices, useService, Container } from './container/Container.js';
import { AnalyticsService } from './services/AnalyticsService.js';

export async function activate(context: vscode.ExtensionContext) {
    // Create output channel with log flag for auto-categorization
    const outputChannel = vscode.window.createOutputChannel('Qdrant Code Search', { log: true });
    context.subscriptions.push(outputChannel);

    // IMPORTANT: Show it immediately so user sees logs
    outputChannel.show(false);  // false = don't steal focus

    // Add timestamp and startup message
    outputChannel.appendLine("════════════════════════════════════════════════════════");
    outputChannel.appendLine(`🚀 Qdrant Code Search Extension Starting...`);
    outputChannel.appendLine(`📅 Time: ${new Date().toISOString()}`);
    outputChannel.appendLine(`📍 Extension URI: ${context.extensionUri.fsPath}`);
    outputChannel.appendLine("════════════════════════════════════════════════════════");

    const traceEnabled = vscode.workspace.getConfiguration('qdrant.search').get('trace', false) as boolean;

    // Helper function to conditionally log based on trace setting
    const log = (message: string, level: 'INFO' | 'ERROR' | 'WARN' | 'COMMAND' | 'SEARCH' | 'OPEN' | 'CONFIG' | 'FATAL' = 'INFO') => {
        if (traceEnabled || level === 'ERROR' || level === 'FATAL') {
            outputChannel.appendLine(`[${level}] ${message}`);
        }
    };

    log('Qdrant Code Search extension is now active!');

    // Initialize analytics as early as possible
    const analytics = new AnalyticsService(context);
    analytics.trackEvent('extension.activated');

    try {
        log('Initializing DI container and services...');
        // Initialize DI container with all services
        initializeServices(context);
        log('DI container and services initialized successfully.');

        log('Retrieving services from container...');
        // Get services via container (lazy initialization with proper dependency resolution)
        const configService = useService('ConfigService');
        const indexingService = useService('IndexingService');
        const workspaceManager = useService('WorkspaceManager');
        const analyticsService = useService('AnalyticsService');
        log('Services retrieved from container.');

        // Create webview controller
        const webviewController = new WebviewController(
            context.extensionUri,
            indexingService,
            workspaceManager,
            configService,
            analyticsService,
            outputChannel
        );
        log('WebviewController created.');

        // Register webview provider FIRST and SYNCHRONOUSLY before any other operations
        // This ensures the provider is available when the view is activated
        analytics.trackEvent('provider.beforeRegister', { viewType: WebviewController.viewType });
        log(`Registering webview provider for ${WebviewController.viewType}`);

        try {
            const webviewProviderDisposable = vscode.window.registerWebviewViewProvider(
                WebviewController.viewType,
                webviewController,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true
                    }
                }
            );
            context.subscriptions.push(webviewProviderDisposable);
            log(`Webview provider registered successfully for ${WebviewController.viewType}`);
            analytics.trackEvent('provider.registered', { success: true, viewType: WebviewController.viewType });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            log(`Failed to register webview provider: ${errorMsg} | viewType=${WebviewController.viewType}`, 'ERROR');
            analytics.trackError(
                'provider.register.failed',
                errorMsg + ' | viewType=' + WebviewController.viewType
            );
        }

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
        log('Registering command: qdrant.index.start');
        context.subscriptions.push(
            vscode.commands.registerCommand('qdrant.index.start', async () => {
                log('qdrant.index.start invoked', 'COMMAND');
                analyticsService.trackCommand('qdrant.index.start');

                const folder = workspaceManager.getActiveWorkspaceFolder();
                if (!folder) {
                    vscode.window.showErrorMessage('No workspace folder found');
                    analyticsService.trackError('no_workspace_folder', 'qdrant.index.start');
                    return;
                }

                // Update status
                statusBarItem.text = "$(sync~spin) Qdrant: Indexing...";
                const startTime = Date.now();

                try {
                    await indexingService.startIndexing(folder);
                    const duration = Date.now() - startTime;
                    statusBarItem.text = "$(database) Qdrant: Ready";
                    vscode.window.showInformationMessage('Workspace indexed successfully!');

                    analyticsService.trackIndexing({
                        duration,
                        success: true
                    });
                } catch (error) {
                    const duration = Date.now() - startTime;
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    statusBarItem.text = "$(database) Qdrant: Error";
                    vscode.window.showErrorMessage(`Indexing failed: ${error}`);
                    log(`Indexing failed: ${errorMsg} (duration: ${duration}ms)`, 'ERROR');

                    analyticsService.trackIndexing({
                        duration,
                        success: false
                    });
                    analyticsService.trackError('indexing_failed', 'qdrant.index.start');
                }
            })
        );

        log('Registering command: qdrant.openSettings');
        context.subscriptions.push(
            vscode.commands.registerCommand('qdrant.openSettings', () => {
                log('qdrant.openSettings invoked', 'COMMAND');
                analyticsService.trackCommand('qdrant.openSettings');
                vscode.commands.executeCommand('workbench.action.openSettings', 'qdrant');
            })
        );

        // Send initial status to webview
        webviewController.sendNotification('index/status', { status: 'ready' });
        log('Qdrant Code Search extension activated successfully');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[ERROR] Failed to activate Qdrant Code Search extension: ${errorMessage}`);
        console.error('Failed to activate Qdrant Code Search extension:', error);
        analytics.trackError('activate.failed', errorMessage);
        vscode.window.showErrorMessage(`Failed to activate Qdrant Code Search: ${errorMessage}`);
        throw error;
    }

    // Global error handler for unexpected errors in the extension host
    process.on('uncaughtException', (err: any) => {
        outputChannel.appendLine(`[FATAL] Uncaught exception in extension host: ${err instanceof Error ? err.message : String(err)}`);
        console.error('Uncaught exception in extension host', err);
        analytics.trackError(
            'global.uncaught',
            err instanceof Error ? err.message : String(err)
        );
    });
}

export async function deactivate() {
    // Properly dispose all services in reverse dependency order
    await Container.instance.dispose();
}