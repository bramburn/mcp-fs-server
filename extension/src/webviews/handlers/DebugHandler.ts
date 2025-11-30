import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ClipboardService } from "../../services/ClipboardService.js";
import { ILogger } from "../../services/LoggerService.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  DEBUG_ANALYZE_METHOD,
  DEBUG_COPY_METHOD,
  DebugAnalyzeResponse,
  DebugCopyParams,
  IpcCommand,
  IpcRequest,
  IpcResponse,
} from "../protocol.js";

export class DebugHandler implements IRequestHandler {
  constructor(
    private logger: ILogger,
    private clipboardService: ClipboardService
  ) {}

  public canHandle(method: string): boolean {
    return [DEBUG_ANALYZE_METHOD, DEBUG_COPY_METHOD].includes(method);
  }

  public async handleRequest(
    request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
    switch (request.method) {
      case DEBUG_ANALYZE_METHOD:
        return this.analyzeActiveFile(request);
      default:
        throw new Error(
          `Method ${request.method} not supported by DebugHandler`
        );
    }
  }

  public async handleCommand(
    command: IpcCommand<any>,
    _context: IpcContext
  ): Promise<void> {
    switch (command.method) {
      case DEBUG_COPY_METHOD:
        await this.copyDebugContext(command.params as DebugCopyParams);
        break;
      default:
        throw new Error(
          `Method ${command.method} not supported by DebugHandler`
        );
    }
  }

  private async analyzeActiveFile(
    request: IpcRequest<any>
  ): Promise<IpcResponse<DebugAnalyzeResponse>> {
    const editor = vscode.window.activeTextEditor;

    // Check 1: Is there an active editor/document?
    // We also reject transient files unless they are saved/persisted.
    if (!editor || editor.document.isUntitled) {
      return {
        kind: "response",
        responseId: request.id,
        id: crypto.randomUUID(),
        scope: request.scope,
        timestamp: Date.now(),
        data: { hasActiveEditor: false },
      };
    }

    const uri = editor.document.uri;
    let relativePath = uri.toString();

    // Try to get relative path if workspace is open
    try {
      // Renamed 'e' to '_e' to fix linting issue
      relativePath = vscode.workspace.asRelativePath(uri, false);
    } catch (_e) {
      // If not in workspace, use full path
      relativePath = uri.fsPath;
    }

    const diagnostics = vscode.languages.getDiagnostics(uri);
    // Filter for errors and warnings only
    const errors = diagnostics.filter(
      (d) =>
        d.severity === vscode.DiagnosticSeverity.Error ||
        d.severity === vscode.DiagnosticSeverity.Warning
    );

    return {
      kind: "response",
      responseId: request.id,
      id: crypto.randomUUID(),
      scope: request.scope,
      timestamp: Date.now(),
      data: {
        hasActiveEditor: true,
        // Use the calculated relative/full path
        filePath: relativePath,
        fileName: path.basename(uri.fsPath),
        language: editor.document.languageId,
        errorCount: errors.length,
      },
    };
  }

  private async copyDebugContext(_params: DebugCopyParams) {
    const editor = vscode.window.activeTextEditor;
    // Check 1: Is there an active editor/document?
    if (!editor || editor.document.isUntitled) {
      vscode.window.showErrorMessage("No active saved file to debug.");
      return;
    }

    const uri = editor.document.uri;
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const content = editor.document.getText();

    let relativePath = uri.toString();
    try {
      // Renamed 'e' to '_e' to fix linting issue
      relativePath = vscode.workspace.asRelativePath(uri, false);
    } catch (_e) {
      relativePath = uri.fsPath;
    }

    // Format the diagnostics
    let errorContext = "";
    if (diagnostics.length > 0) {
      errorContext += `### Diagnostics / Errors:\n`;
      diagnostics.forEach((d) => {
        const line = d.range.start.line + 1;
        const severity =
          d.severity === vscode.DiagnosticSeverity.Error ? "Error" : "Warning";
        errorContext += `- [${severity}] Line ${line}: ${d.message}\n`;
      });
      errorContext += `\n`;
    } else {
      errorContext += `No active errors detected by VS Code.\n\n`;
    }

    // The prompt text that was previously copied separately:
    const promptText =
      "Please review the attached code and error and please fix my code to resolve the errors";

    // Create the markdown payload
    // FIX 1: Embed the prompt text into the markdown file content itself.
    const markdownContent = `${promptText}

---

This is the error:

\`\`\`markdown
# Debug Context: ${relativePath}

${errorContext}

### File Content:
\`\`\`${editor.document.languageId}
${content}
\`\`\`
\`\`\`
`;

    try {
      // 1. Write the markdown to a temporary file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `debug-context-${Date.now()}.md`);
      await fs.promises.writeFile(tempFilePath, markdownContent, "utf8");

      // 2. Use ClipboardService (Rust binary) to copy the file to clipboard
      // FIX 2: This operation sets the file reference on the clipboard.
      await this.clipboardService.copyFilesToClipboard([tempFilePath]);

      // 3. REMOVED: Conflicting operation that overwrites the clipboard, thus deleting the file reference.
      // await vscode.env.clipboard.writeText(promptText);

      // FIX 3: Update confirmation message.
      vscode.window.showInformationMessage(
        `Debug context file copied! You can now paste the attachment into your chat tool.`
      );
    } catch (err) {
      this.logger.log(`Failed to copy debug context: ${err}`, "ERROR");
      vscode.window.showErrorMessage("Failed to prepare debug context.");
    }
  }
}
