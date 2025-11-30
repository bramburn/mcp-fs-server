import * as vscode from "vscode";
import { AnalyticsService } from "../../services/AnalyticsService";
import { ClipboardService } from "../../services/ClipboardService";
import { ILogger } from "../../services/LoggerService";
import {
  COPY_RESULTS_METHOD,
  CopyResultsParams,
  EXECUTE_COMMAND_METHOD,
  ExecuteCommandParams,
  FileSnippetResult,
  IpcCommand,
  IpcRequest,
  IpcResponse,
  OPEN_FILE_METHOD,
  OpenFileParams,
} from "../protocol.js"; // Added .js extension
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js"; // Added .js extension

export class FileHandler implements IRequestHandler {
  constructor(
    private clipboardService: ClipboardService,
    private analyticsService: AnalyticsService,
    private logger: ILogger
  ) {}

  public canHandle(method: string): boolean {
    return [
      OPEN_FILE_METHOD,
      EXECUTE_COMMAND_METHOD,
      COPY_RESULTS_METHOD,
    ].includes(method);
  }

  public async handleRequest(
    _request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
    throw new Error("FileHandler only handles commands");
  }

  public async handleCommand(command: IpcCommand<any>, _context: IpcContext): Promise<void> {
    switch (command.method) {
      case OPEN_FILE_METHOD:
        await this.handleOpenFile(command.params as OpenFileParams);
        break;
      case EXECUTE_COMMAND_METHOD:
        await this.handleExecuteCommand(command.params as ExecuteCommandParams);
        break;
      case COPY_RESULTS_METHOD:
        await this.handleCopyResults(command.params as CopyResultsParams);
        break;
      default:
        throw new Error(`Method ${command.method} not supported by FileHandler`);
    }
  }

  private async handleOpenFile(params: OpenFileParams) {
    if (!params.uri) throw new Error("Missing URI");
    const fileUri = vscode.Uri.parse(params.uri);
    const lineNumber = Math.max(0, (params.line || 1) - 1);
    const position = new vscode.Position(lineNumber, 0);

    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Active,
      selection: new vscode.Range(position, position),
    });
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  private async handleExecuteCommand(params: ExecuteCommandParams) {
    // !AI: Security risk - Whitelisting recommended.
    if (!params.command) throw new Error("Missing command");
    await vscode.commands.executeCommand(params.command, ...(params.args || []));
  }

  private async handleCopyResults(params: CopyResultsParams) {
    const { mode, results, query, includeQuery } = params;

    // Deduplicate logic
    const byUri = new Map<string, FileSnippetResult[]>();
    for (const r of results) {
        const arr = byUri.get(r.uri) ?? [];
        arr.push(r);
        byUri.set(r.uri, arr);
    }

    if (mode === "files") {
       const filePaths = Array.from(byUri.keys()).map(u => vscode.Uri.parse(u).fsPath);
       await this.clipboardService.copyFilesToClipboard(filePaths);
    } else {
        // Snippet mode
        let buffer = "";
        if (includeQuery && query) buffer += `Instruction: ${query}\n\n`;

        for (const [uriString, snippets] of byUri) {
            const uri = vscode.Uri.parse(uriString);
            const rel = vscode.workspace.asRelativePath(uri, false);
            buffer += `// File: ${rel}\n`;
            for(const s of snippets) {
                // Determine language based on file extension for better formatting
                const extension = rel.split(".").pop()?.toLowerCase();
                const language = extension ? this.getLanguageFromExtension(extension) : 'text';

                buffer += `// Lines ${s.lineStart}-${s.lineEnd}\n`;
                buffer += `\`\`\`${language}\n`;
                buffer += `${s.snippet ?? ""}\n`;
                buffer += `\`\`\`\n\n`;
            }
        }
        await vscode.env.clipboard.writeText(buffer);
        vscode.window.setStatusBarMessage("Copied to clipboard", 2000);
    }
    
    this.analyticsService.trackEvent("results_copied", { mode, count: results.length });
  }

  /**
   * Helper method (moved from WebviewController) to get language from file extension for syntax highlighting
   */
  private getLanguageFromExtension(extension: string): string {
    const languageMap: { [key: string]: string } = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      rust: "rust",
      rs: "rust",
      go: "go",
      kt: "kotlin",
      kts: "kotlin",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      rb: "ruby",
      swift: "swift",
      scala: "scala",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      fish: "bash",
      ps1: "powershell",
      bat: "batch",
      cmd: "batch",
      html: "html",
      htm: "html",
      xml: "xml",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      toml: "toml",
      ini: "ini",
      sql: "sql",
      md: "markdown",
      dockerfile: "dockerfile",
      docker: "dockerfile",
      makefile: "makefile",
      vue: "vue",
      svelte: "svelte",
      astro: "astro",
    };

    return languageMap[extension] || "text";
  }
}