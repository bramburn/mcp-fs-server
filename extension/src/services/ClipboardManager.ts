import * as vscode from 'vscode';
import * as path from 'path';
import { ClipboardService } from './ClipboardService.js';
import { XmlParser } from './XmlParser.js';
import { WebviewController } from '../webviews/WebviewController.js'; 
import { ParsedAction, ClipboardHistoryItem } from '../webviews/protocol.js';

export class ClipboardManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private clipboardService: ClipboardService,
        private xmlParser: XmlParser,
        private webviewController: WebviewController
    ) {
        this.initialize();
    }

    private initialize() {
        // Listen to the specific trigger event from ClipboardService
        this.disposables.push(
            this.clipboardService.onTriggerXml((payloads) => this.handleXmlTrigger(payloads))
        );
    }

    private async handleXmlTrigger(xmlPayloads: string[]) {
        // 1. Parse the raw XML into structured actions
        const actions = this.xmlParser.parse(xmlPayloads);
        
        if (actions.length === 0) return;

        // 2. Validate actions (Check if files exist, check security)
        const validatedActions = await Promise.all(actions.map(async (action) => {
            return this.validateAction(action);
        }));

        // 3. Create the History Item
        const historyItem: ClipboardHistoryItem = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            originalContent: xmlPayloads.join('\n\n'), // Store raw for reference
            type: 'xml-command',
            parsedActions: validatedActions
        };

        // 4. Send to Webview
        this.webviewController.sendToWebview({
            id: crypto.randomUUID(),
            scope: 'debugger',
            kind: 'notification',
            timestamp: Date.now(),
            method: 'clipboard/history-add',
            params: { item: historyItem }
        });

        // 5. Notify User
        const validCount = validatedActions.filter(a => a.status !== 'error').length;
        const errorCount = validatedActions.length - validCount;
        
        if (errorCount > 0) {
            vscode.window.showWarningMessage(`Clipboard parsed: ${validCount} valid actions, ${errorCount} errors.`);
        } else {
            vscode.window.showInformationMessage(`Clipboard parsed: ${validCount} actions ready.`);
        }
    }

    private async validateAction(action: ParsedAction): Promise<ParsedAction> {
        // Skip validation if already errored by parser
        if (action.status === 'error') return action;

        // Validation for File Operations
        if (action.type === 'file' || action.type === 'read') {
            if (!action.path) {
                return { ...action, status: 'error', errorDetails: 'No file path provided.' };
            }

            // Resolve path relative to workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return { ...action, status: 'error', errorDetails: 'No workspace open.' };
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const absolutePath = path.join(rootPath, action.path);

            // Security Check: Prevent accessing parent directories or hidden files
            if (action.path.includes('..') || path.isAbsolute(action.path)) {
                 return { ...action, status: 'error', errorDetails: 'Invalid relative path.' };
            }

            // Check if file exists (only if action is NOT 'create', or if 'read')
            // For 'create', we don't strictly require it to not exist, but we might warn if it does (overwrite).
            // For 'replace' or 'read', it MUST exist.
            if (action.type === 'read' || (action.type === 'file' && action.action === 'replace')) {
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
                    // File exists, action is valid
                    return { ...action, status: 'ready' };
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_) { // Fixed: prefix with _ to mark unused
                    // File does not exist
                    return { 
                        ...action, 
                        status: 'error', 
                        errorDetails: `File not found: ${action.path}` 
                    };
                    // TODO: Here is where we would trigger the Semantic Search fallback logic
                }
            }
        }

        return { ...action, status: 'ready' };
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}