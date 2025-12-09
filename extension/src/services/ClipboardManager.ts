import * as vscode from 'vscode';
import * as path from 'path';
import { ClipboardService } from './ClipboardService.js';
import { XmlParser } from './XmlParser.js';
import { WebviewController } from '../webviews/WebviewController.js'; 
import { ParsedAction, ClipboardHistoryItem, MONITOR_STOP_COMMAND } from '../webviews/protocol.js';

// List of highly sensitive patterns that should never be edited/read by AI.
const SENSITIVE_FILE_BLOCKLIST = [
    '**/.git/**',
    '**/node_modules/**',
    '**/.vscode/**',
    '**/.ssh/**',
    '**/.env',
    '**/*.key',
    '**/*.pem',
    '**/credentials.*'
];

export class ClipboardManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private isMonitoring = false;
    private monitorTimeout: NodeJS.Timeout | null = null;

    constructor(
        private clipboardService: ClipboardService,
        private xmlParser: XmlParser,
        private webviewController: WebviewController
    ) {
        this.initialize();
    }

    private initialize() {
        // Listen to the specific trigger event from ClipboardService (always active for automations)
        this.disposables.push(
            this.clipboardService.onTriggerXml((payloads) => this.handleXmlTrigger(payloads))
        );

        // Listen for general clipboard updates
        this.disposables.push(
            this.clipboardService.onClipboardUpdate((content) => this.handleClipboardUpdate(content))
        );
    }

    /**
     * Toggles the "Capture All" mode on the Rust sidecar.
     * When enabled, the monitor sends all clipboard content.
     * When disabled, it only sends XML triggers.
     */
    public toggleCapture(enabled: boolean) {
        this.clipboardService.setCaptureAll(enabled);
        vscode.window.setStatusBarMessage(
            enabled ? "Clipboard: Capturing all clippings" : "Clipboard: Capturing only automations", 
            3000
        );
    }

    public startMonitoring(durationMinutes: number) {
        this.isMonitoring = true;
        
        // Enable capture on the Rust side
        this.toggleCapture(true);

        // Clear existing timeout if any
        if (this.monitorTimeout) {
            clearTimeout(this.monitorTimeout);
        }

        const durationMs = durationMinutes * 60 * 1000;
        this.monitorTimeout = setTimeout(() => {
            this.stopMonitoring();
        }, durationMs);

        vscode.window.setStatusBarMessage(`Clipboard Monitor Started (${durationMinutes}m)`, 3000);
    }

    public stopMonitoring() {
        if (!this.isMonitoring) return;

        this.isMonitoring = false;
        
        // Disable capture on the Rust side (revert to default)
        this.toggleCapture(false);

        if (this.monitorTimeout) {
            clearTimeout(this.monitorTimeout);
            this.monitorTimeout = null;
        }

        // Notify Webview that monitoring stopped
        this.webviewController.sendToWebview({
            id: crypto.randomUUID(),
            scope: 'debugger',
            kind: 'notification',
            timestamp: Date.now(),
            method: MONITOR_STOP_COMMAND,
            params: {}
        });

        // Notify User via desktop notification
        vscode.window.showInformationMessage("Clipboard monitoring session has ended.");
    }

    private async handleClipboardUpdate(content: string) {
        // NOTE: We no longer check `this.isMonitoring` here because the filtering 
        // is now handled efficiently by the Rust binary. If we receive an event here, 
        // it means capturing is enabled.

        // Create a history item for the plain text content
        const historyItem: ClipboardHistoryItem = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            originalContent: content,
            type: 'text',
            parsedActions: []
        };

        // Send to Webview
        this.webviewController.sendToWebview({
            id: crypto.randomUUID(),
            scope: 'debugger',
            kind: 'notification',
            timestamp: Date.now(),
            method: 'clipboard/history-add',
            params: { item: historyItem }
        });
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

            // --- Phase 4 Feature: Safety Guardrails ---
            const isSensitive = SENSITIVE_FILE_BLOCKLIST.some(pattern => {
                // Check if the path matches any sensitive glob pattern
                // Use non-null assertion (!) here since we checked action.path above
                const match = vscode.workspace.asRelativePath(action.path!).match(new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')));
                return match !== null;
            });

            if (isSensitive) {
                return { 
                    ...action, 
                    status: 'error', 
                    errorDetails: 'Access Denied: This file path is restricted for security.' 
                };
            }
            // ----------------------------------------
            
            // Resolve path relative to workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return { ...action, status: 'error', errorDetails: 'No workspace open.' };
            }

            // Note: Absolute path is primarily for the FS API, security checks use relative path above.
            const rootPath = workspaceFolders[0].uri.fsPath;
            const absolutePath = path.join(rootPath, action.path);

            // Security Check: Prevent accessing parent directories or absolute paths (redundant, but good practice)
            if (action.path.includes('..') || path.isAbsolute(action.path)) {
                 return { ...action, status: 'error', errorDetails: 'Invalid relative path.' };
            }

            // Check if file exists (only if action is NOT 'create', or if 'read')
            if (action.type === 'read' || (action.type === 'file' && action.action === 'replace')) {
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
                    // File exists, action is valid
                    return { ...action, status: 'ready' };
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_error) { // Use _error to denote unused variable
                    // File does not exist
                    return { 
                        ...action, 
                        status: 'error', 
                        errorDetails: `File not found: ${action.path}` 
                    };
                }
            }
        }

        return { ...action, status: 'ready' };
    }

    public dispose() {
        if (this.monitorTimeout) {
            clearTimeout(this.monitorTimeout);
        }
        this.disposables.forEach(d => d.dispose());
    }
}