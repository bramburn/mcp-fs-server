import * as vscode from 'vscode';
import { ConfigService } from './ConfigService.js';
import { IndexingService } from './IndexingService.js';

/**
 * Manages the workspace context, specifically handling multi-root workspaces
 * and coordinating the active configuration.
 */
export class WorkspaceManager {
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _configService: ConfigService,
        private readonly _indexingService: IndexingService
    ) {}

    public async initialize(): Promise<void> {
        // Initial check
        await this.checkWorkspaceIntegrity();

        // Listen for workspace changes
        this._context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.checkWorkspaceIntegrity();
            })
        );
    }

    /**
     * Checks for multiple workspace folders and ensures no conflicting configurations.
     */
    public async checkWorkspaceIntegrity(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;

        if (!folders || folders.length === 0) {
            return;
        }

        if (folders.length > 1) {
            // Multi-root workspace detected
            console.log('Multi-root workspace detected. Checking configurations...');
            
            // For P1, we simply warn if multiple folders have different configs
            // or if the complexity is high.
// !AI: MVP scope gap: Production version needs proper config merging or user selection for multi-root workspaces.
            // A production version would merge them or ask the user to select the active one.
            
            let configCount = 0;
            for (const folder of folders) {
                const config = await this._configService.loadConfig(folder);
                if (config) {
                    configCount++;
                }
            }

// !AI: MVP workflow gap: User is only shown a warning and implicitly uses the first config. Needs explicit selection mechanism.
            if (configCount > 1) {
                vscode.window.showWarningMessage(
                    'Multiple .qdrant configurations detected. The extension will currently use the first valid one found.',
                    'Open Settings'
                );
            }
        }
    }

    /**
     * Returns the primary workspace folder to use for indexing.
     */
    public getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        const folders = vscode.workspace.workspaceFolders;
// !AI: MVP scope gap: Simply returning the first folder. Need logic to determine the context-aware folder (e.g., based on active text document).
        if (!folders) return undefined;
        // Simple logic: return the first one for now
        return folders[0];
    }
}