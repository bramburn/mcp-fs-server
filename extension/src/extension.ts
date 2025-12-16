import * as vscode from 'vscode';
import { Container } from './container/Container.js';
import { WebviewController } from './webviews/WebviewController.js';
import { minimatch } from 'minimatch';

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

        // 5. Check Index Status and Update Status Bar
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Setting up index status monitoring...`);

        const indexStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        indexStatusItem.show();
        indexStatusItem.tooltip = 'Repo Index Status';
        indexStatusItem.command = "qdrant.index.start";
        context.subscriptions.push(indexStatusItem);

        // Function to check index status for all workspace folders
        async function checkIndexStatus(): Promise<void> {
            const folders = vscode.workspace.workspaceFolders || [];
            if (folders.length === 0) {
                indexStatusItem.text = '$(warning) No Workspace';
                indexStatusItem.color = new vscode.ThemeColor('errorForeground');
                return;
            }

            let syncedCount = 0;
            let needsReindex = false;
            const syncPromises = folders.map(async (folder) => {
                try {
                    const repoId = await container?.indexingService.getRepoId(folder);
                    const currentHash = await container?.workspaceManager.gitProvider?.getLastCommit(folder.uri.fsPath) || 'HEAD';
                    const metadata = container?.indexingService.indexMetadataService.get(repoId);

                    const synced = metadata && metadata.lastHash === currentHash;

                    if (synced) {
                        syncedCount++;
                    } else {
                        needsReindex = true;
                    }
                } catch (error) {
                    console.error(`Failed to check index status for ${folder.name}:`, error);
                }
            });

            await Promise.all(syncPromises);

            if (needsReindex) {
                indexStatusItem.text = '$(sync-problem) Out of Sync';
                indexStatusItem.color = new vscode.ThemeColor('errorForeground');

                if (folders.length === 1) {
                    const folder = folders[0];
                    const choice = await vscode.window.showWarningMessage(
                        `Index out of sync for ${folder.name}`,
                        'Index Now'
                    );

                    if (choice === 'Index Now') {
                        await container?.indexingService.startIndexing(folder);
                    }
                }
            } else if (syncedCount === folders.length) {
                indexStatusItem.text = '$(check) Indexed';
                indexStatusItem.color = new vscode.ThemeColor('notificationsInfoForeground');
            } else {
                indexStatusItem.text = '$(database) Partially Indexed';
                indexStatusItem.color = new vscode.ThemeColor('warningForeground');
            }
        }

        // Check index status on activation
        await checkIndexStatus();

        // Re-check when workspace folders change
        const workspaceFoldersDisposer = vscode.workspace.onDidChangeWorkspaceFolders(checkIndexStatus);
        context.subscriptions.push(workspaceFoldersDisposer);

        // Listen to indexing service progress for status updates
        container.indexingService.addProgressListener(async (progress) => {
            if (progress.status === 'completed') {
                // Refresh status after indexing completes
                await checkIndexStatus();
            }
        });

        // Register command to manually refresh index status
        const refreshStatusCmd = vscode.commands.registerCommand('qdrant.refreshIndexStatus', checkIndexStatus);
        context.subscriptions.push(refreshStatusCmd);

        // 7. Set up continuous file monitoring for incremental updates
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Setting up file system monitoring...`);

        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        const changedFiles = new Set<string>();
        let updateTimeout: NodeJS.Timeout | undefined;

        // Debounced file change handler
        const handleFileChange = async () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            updateTimeout = setTimeout(async () => {
                const filesToProcess = Array.from(changedFiles);
                changedFiles.clear();

                for (const fileUri of filesToProcess) {
                    const folder = vscode.workspace.getWorkspaceFolder(fileUri);
                    if (!folder) continue;

                    try {
                        // Check if file is in an excluded pattern
                        const config = container.configService.config;
                        const relativePath = vscode.workspace.asRelativePath(fileUri);

                        // Check exclusions
                        const excluded = config.qdrantConfig?.indexinfo?.excludedPatterns?.some(pattern => {
                            try {
                                return minimatch(relativePath, pattern);
                            } catch {
                                return false;
                            }
                        });

                        if (excluded) continue;

                        // Check if file extension is included
                        const ext = relativePath.split('.').pop();
                        const included = config.qdrantConfig?.indexinfo?.includedExtensions?.includes(ext);
                        if (!included) continue;

                        // Get file content
                        const content = await vscode.workspace.fs.readFile(fileUri);
                        const text = new TextDecoder().decode(content);

                        // Get repo info
                        const repoId = await container.indexingService.getRepoId(folder);
                        const currentHash = await container.workspaceManager.gitProvider?.getLastCommit(folder.uri.fsPath) || 'HEAD';

                        // Get collection name
                        const collectionName = config.qdrantConfig?.indexinfo?.name || 'codebase';

                        // Index the file incrementally
                        outputChannel.appendLine(`[FILE_WATCHER] Incrementally indexing: ${relativePath}`);
                        await container.indexingService.indexFile(collectionName, relativePath, text, undefined, repoId, currentHash);

                        // Update metadata after successful indexing
                        await container.indexingService.indexMetadataService.update(repoId, currentHash);

                        // Refresh status after incremental update
                        await checkIndexStatus();
                    } catch (error) {
                        console.error(`Failed to incrementally index ${fileUri.fsPath}:`, error);
                        outputChannel.appendLine(`[FILE_WATCHER] Error indexing ${fileUri.fsPath}: ${error}`);
                    }
                }

                // Optionally re-check status after processing changes
                // await checkIndexStatus();
            }, 2000); // Wait 2 seconds after last change before processing
        };

        // Watch for file changes
        fileWatcher.onDidChange((uri: vscode.Uri) => {
            changedFiles.add(uri.toString());
            handleFileChange();
        });

        fileWatcher.onDidCreate((uri: vscode.Uri) => {
            changedFiles.add(uri.toString());
            handleFileChange();
        });

        // Clean up on dispose
        context.subscriptions.push(fileWatcher);

        // 8. Register Commands
        outputChannel.appendLine(`[${new Date().toISOString()}] ACTIVATE: Registering commands...`);

        const openSettingsCmd = vscode.commands.registerCommand('qdrant.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'semanticSearch');
        });
        context.subscriptions.push(openSettingsCmd);

        const indexWorkspaceCmd = vscode.commands.registerCommand('qdrant.index.start', async () => {
            if (container) {
                try {
                    await container.indexingService.startIndexing();
                    // Re-check status after indexing completes
                    await checkIndexStatus();
                } catch (error) {
                    vscode.window.showErrorMessage(`Indexing failed: ${error instanceof Error ? error.message : String(error)}`);
                }
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