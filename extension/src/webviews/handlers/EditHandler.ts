import * as vscode from 'vscode';
import * as path from 'path';
import { IpcContext, IRequestHandler } from '../ipc/IpcRouter.js';
import { 
    IpcCommand, 
    IpcRequest, 
    IpcResponse,
    WEBVIEW_ACTION_IMPLEMENT, 
    WEBVIEW_ACTION_PREVIEW,
    ParsedAction 
} from '../protocol.js';

export class EditHandler implements IRequestHandler {
    constructor() {}

    public canHandle(method: string): boolean {
        return [WEBVIEW_ACTION_IMPLEMENT, WEBVIEW_ACTION_PREVIEW].includes(method);
    }

    public async handleRequest(request: IpcRequest<any>, _context: IpcContext): Promise<IpcResponse<any>> {
        throw new Error("EditHandler only handles commands");
    }

    public async handleCommand(command: IpcCommand<any>, context: IpcContext): Promise<void> {
        const action = command.params as ParsedAction;

        try {
            if (command.method === WEBVIEW_ACTION_IMPLEMENT) {
                await this.applyEdit(action);
                vscode.window.showInformationMessage(`Successfully applied changes to ${action.path}`);
            } else if (command.method === WEBVIEW_ACTION_PREVIEW) {
                await this.previewEdit(action);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Action Failed: ${msg}`);
            context.log(`Edit Action Failed: ${msg}`, 'ERROR');
        }
    }

    private async applyEdit(action: ParsedAction): Promise<void> {
        if (!action.path) throw new Error("No file path specified.");

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) throw new Error("No workspace open.");

        const rootPath = workspaceFolders[0].uri;
        const fileUri = vscode.Uri.joinPath(rootPath, action.path);

        if (action.action === 'create') {
            const content = new TextEncoder().encode(action.content || '');
            await vscode.workspace.fs.writeFile(fileUri, content);
        } else if (action.action === 'replace') {
            await this.performSearchAndReplace(fileUri, action);
        }
    }

    private async performSearchAndReplace(uri: vscode.Uri, action: ParsedAction): Promise<void> {
        // 1. Read File
        const document = await vscode.workspace.openTextDocument(uri);
        const fullText = document.getText();
        const searchBlock = action.searchBlock || '';
        const replaceBlock = action.replaceBlock || '';

        if (!searchBlock) throw new Error("Missing <search> block for replace action.");

        // 2. Find Matches (Exact Match First)
        // Normalize line endings to LF for comparison
        const normalizedDoc = fullText.replace(/\r\n/g, '\n');
        const normalizedSearch = searchBlock.replace(/\r\n/g, '\n').trim();
        
        // Escape regex special characters for literal search
        const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Create regex that allows variable whitespace at start/end of lines if needed, 
        // but for "Strict" mode we start with literal index finding.
        let matchIndex = normalizedDoc.indexOf(normalizedSearch);
        let indices: number[] = [];
        
        while (matchIndex !== -1) {
            indices.push(matchIndex);
            matchIndex = normalizedDoc.indexOf(normalizedSearch, matchIndex + 1);
        }

        if (indices.length === 0) {
            // TODO: Implement Fuzzy / Semantic Search fallback here
            throw new Error(`Could not find the code block to replace in ${action.path}. Please verify the <search> block matches exactly.`);
        }

        if (indices.length > 1 && !action.multiLineApprove) {
            // Check if specific lines were requested to resolve ambiguity
            throw new Error(`Found ${indices.length} occurrences of the search block. Please specify 'lines="..."' or 'multiLineApprove="true"' attributes.`);
        }

        // 3. Apply Edits
        const edit = new vscode.WorkspaceEdit();
        
        // In exact string matching, we need to map string indices back to Document Positions.
        // A simpler way with VS Code API is using document text offsets.
        const activeEditor = await vscode.window.showTextDocument(document);
        
        await activeEditor.edit(editBuilder => {
            // We use the first match if multiple are allowed or only one exists
            // Reverse order to not mess up offsets if multiple
            const index = indices[0]; 
            const startPos = document.positionAt(index);
            const endPos = document.positionAt(index + normalizedSearch.length);
            
            editBuilder.replace(new vscode.Range(startPos, endPos), replaceBlock);
        });

        await document.save();
    }

    private async previewEdit(action: ParsedAction): Promise<void> {
        // For preview, we can use VS Code's diff command
        // 1. Write the "After" state to a temporary file
        // 2. Run vscode.diff(original, temp)
        
        if (!action.path) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, action.path);
        
        try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const originalContent = doc.getText();
            let newContent = originalContent;

            if (action.action === 'create') {
                newContent = action.content || '';
            } else if (action.action === 'replace' && action.searchBlock) {
                // Simple string replace for preview (first match)
                newContent = originalContent.replace(action.searchBlock.trim(), (action.replaceBlock || '').trim());
            }

            // Create temp file for RHS of diff
            // Note: In a real implementation, use a proper temp file service
            const tempUri = fileUri.with({ scheme: 'untitled', path: fileUri.path + '.preview' });
            const edit = new vscode.WorkspaceEdit();
            edit.insert(tempUri, new vscode.Position(0, 0), newContent);
            
            await vscode.workspace.applyEdit(edit);
            
            await vscode.commands.executeCommand('vscode.diff', 
                fileUri, 
                tempUri, 
                `Preview: ${action.path}`
            );

        } catch (e) {
            vscode.window.showErrorMessage("Could not generate preview.");
        }
    }
}