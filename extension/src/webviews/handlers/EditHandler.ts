import * as vscode from 'vscode';
import { IndexingService } from "../../services/IndexingService.js";
import { SearchResultItem } from "../../services/types.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  IpcCommand,
  IpcRequest,
  IpcResponse,
  ParsedAction,
  WEBVIEW_ACTION_IMPLEMENT,
  WEBVIEW_ACTION_PREVIEW,
} from "../protocol.js";

/**
 * Helper to determine if a character index range (a match) is within a user-specified line range.
 */
function isMatchWithinLines(document: vscode.TextDocument, index: number, matchLength: number, linesInput: string): boolean {
    const startPos = document.positionAt(index);
    const endPos = document.positionAt(index + matchLength);
    // Use the 1-based line number of the start of the match
    const targetStartLine = startPos.line + 1; 
    
    // Parse the input string "12, 45-50, 60" into a set of included line numbers/ranges
    const parts = linesInput.split(',').map(p => p.trim()).filter(p => p.length > 0);

    for (const part of parts) {
        if (part.includes('-')) {
            // Handle range "45-50"
            const [start, end] = part.split('-').map(Number);
            if (targetStartLine >= start && targetStartLine <= end) {
                return true;
            }
        } else {
            // Handle single line "12"
            const singleLine = Number(part);
            
            // We check if the match starts or ends on the specified line, 
            // ensuring multiline matches spanning the target line are included.
            if (targetStartLine <= singleLine && endPos.line + 1 >= singleLine) {
                 return true;
            }
        }
    }
    return false;
}


export class EditHandler implements IRequestHandler {
  constructor(private readonly indexingService: IndexingService) {}

  public canHandle(method: string): boolean {
    return [WEBVIEW_ACTION_IMPLEMENT, WEBVIEW_ACTION_PREVIEW].includes(method);
  }

  public async handleRequest(
    _request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
    throw new Error("EditHandler only handles commands");
  }

  public async handleCommand(
    command: IpcCommand<any>,
    context: IpcContext
  ): Promise<void> {
    const action = command.params as ParsedAction;

    try {
      if (command.method === WEBVIEW_ACTION_IMPLEMENT) {
        await this.applyEdit(action);
        vscode.window.showInformationMessage(
          `Successfully applied changes to ${action.path}`
        );
      } else if (command.method === WEBVIEW_ACTION_PREVIEW) {
        await this.previewEdit(action);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Action Failed: ${msg}`);
      context.log(`Edit Action Failed: ${msg}`, "ERROR");
    }
  }

  private async applyEdit(action: ParsedAction): Promise<void> {
    if (!action.path) throw new Error("No file path specified.");

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) throw new Error("No workspace open.");

    const rootPath = workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(rootPath, action.path);

    if (action.action === "create") {
      const content = new TextEncoder().encode(action.content || "");
      await vscode.workspace.fs.writeFile(fileUri, content);
    } else if (action.action === "replace") {
      await this.performSearchAndReplace(fileUri, action);
    }
  }

  private async performSearchAndReplace(
    uri: vscode.Uri,
    action: ParsedAction
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const fullText = document.getText();
    const searchBlock = action.searchBlock || "";
    const replaceBlock = action.replaceBlock || "";
    const linesInput = action.lines || ''; // Ambiguity resolution input

    if (!searchBlock)
      throw new Error("Missing <search> block for replace action.");

    const normalizedDoc = fullText.replace(/\r\n/g, "\n");
    const normalizedSearch = searchBlock.replace(/\r\n/g, "\n").trim();

    const indices: number[] = [];
    let matchIndex = normalizedDoc.indexOf(normalizedSearch);

    while (matchIndex !== -1) {
      indices.push(matchIndex);
      matchIndex = normalizedDoc.indexOf(normalizedSearch, matchIndex + 1);
    }
    
    // --- AMBIGUITY RESOLUTION AND LINE FILTERING ---
    let finalIndices = indices;

    if (linesInput) {
        // Filter the indices based on the user-provided lines
        finalIndices = indices.filter(index => 
            isMatchWithinLines(document, index, normalizedSearch.length, linesInput)
        );
        
        if (finalIndices.length === 0 && indices.length > 0) {
            throw new Error(`Found matches, but none matched the specified lines: ${linesInput}.`);
        }
    }

    if (finalIndices.length === 0) {
      // Semantic Search Fallback: Triggered if no exact match OR no match in specified lines
      const suggestions = await this.findSemanticSuggestions(
        uri,
        normalizedSearch
      );

      if (suggestions.length > 0) {
        throw new Error(
          `Exact match failed. Found similar code blocks in ${
            action.path
          }. Suggestions: ${JSON.stringify(suggestions)}`
        );
      }

      throw new Error(
        `Could not find the code block to replace in ${action.path}. Please verify the <search> block matches exactly.`
      );
    }

    if (finalIndices.length > 1 && !action.multiLineApprove) {
        // If line filtering was unsuccessful or not provided, and we still have ambiguity
        throw new Error(
            `Found ${finalIndices.length} ambiguous occurrences of the search block after filtering. Please set 'multiLineApprove="true"' to apply all edits.`
        );
    }
    // ----------------------------------------------

    // 3. Apply Edits
    const workspaceEdit = new vscode.WorkspaceEdit();

    // Use finalIndices (potentially multiple if multiLineApprove is true)
    for (const index of finalIndices) {
        const startPos = document.positionAt(index);
        const endPos = document.positionAt(index + normalizedSearch.length);
        const range = new vscode.Range(startPos, endPos);
        workspaceEdit.replace(uri, range, replaceBlock);
    }

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (success) {
      await document.save();
    } else {
      throw new Error("Failed to apply edit to workspace.");
    }
  }

  private async findSemanticSuggestions(
    uri: vscode.Uri,
    query: string
  ): Promise<SearchResultItem[]> {
    // Only run semantic search if the file is indexed.
    // We run a small search (limit 5) against the query.

    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(uri) ||
      vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const isIndexed = await this.indexingService.initializeForSearch(
      workspaceFolder
    );

    if (!isIndexed) return [];

    // Use the code block itself as the query
    const rawResults = await this.indexingService.search(query, { limit: 5 });

    return rawResults.filter(
      (r) => r.payload.filePath === vscode.workspace.asRelativePath(uri)
    );
  }

  private async previewEdit(action: ParsedAction): Promise<void> {
    if (!action.path) return;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    // FIX: Add guard clause to prevent accessing workspaceFolders[0] if it's undefined
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No workspace open to generate preview.");
    }

    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, action.path);

    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const originalContent = doc.getText();
      let newContent = originalContent;

      if (action.action === "create") {
        newContent = action.content || "";
      } else if (action.action === "replace" && action.searchBlock) {
        // Find and replace (first match only) for preview
        const normalizedSearch = action.searchBlock
          .replace(/\r\n/g, "\n")
          .trim();
        const normalizedReplace = (action.replaceBlock || "")
          .replace(/\r\n/g, "\n")
          .trim();

        // Note: This simple replace only works if the target is found exactly,
        // simulating the success case. For true diff simulation, we'd need line numbers.
        const matchIndex = originalContent
          .replace(/\r\n/g, "\n")
          .indexOf(normalizedSearch);

        if (matchIndex !== -1) {
          newContent = originalContent.replace(
            normalizedSearch,
            normalizedReplace
          );
        } else {
          // Fallback to suggest the content (like a creation) if replace target isn't found
          newContent =
            originalContent +
            `\n\n// --- PROPOSED CHANGE NOT FOUND --- \n// ${normalizedSearch}\n// --- INSTEAD, NEW BLOCK IS: ---\n ${normalizedReplace}`;
        }
      }

      // Create temp file for RHS of diff
      const tempUri = fileUri.with({
        scheme: "untitled",
        path: fileUri.path + ".preview",
      });
      const edit = new vscode.WorkspaceEdit();
      edit.insert(tempUri, new vscode.Position(0, 0), newContent);

      await vscode.workspace.applyEdit(edit);

      await vscode.commands.executeCommand(
        "vscode.diff",
        fileUri,
        tempUri,
        `Preview: ${action.path}`
      );
    } catch (_e) {
      vscode.window.showErrorMessage("Could not generate preview.");
    }
  }
}