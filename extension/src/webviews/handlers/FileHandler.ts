import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AnalyticsService } from "../../services/AnalyticsService.js";
import { ClipboardService } from "../../services/ClipboardService.js";
import { ILogger } from "../../services/LoggerService.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
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
} from "../protocol.js";

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

  public async handleCommand(
    command: IpcCommand<any>,
    _context: IpcContext
  ): Promise<void> {
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
        throw new Error(
          `Method ${command.method} not supported by FileHandler`
        );
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
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }

  private async handleExecuteCommand(params: ExecuteCommandParams) {
    // !AI: Security risk - Whitelisting recommended.
    if (!params.command) throw new Error("Missing command");
    await vscode.commands.executeCommand(
      params.command,
      ...(params.args || [])
    );
  }

  private async handleCopyResults(params: CopyResultsParams) {
    const { results } = params;

    // 1. Deduplicate files based on URI
    const uniqueUris = new Set<string>();
    const filesToProcess: FileSnippetResult[] = [];
    
    for (const r of results) {
      if (!uniqueUris.has(r.uri)) {
        uniqueUris.add(r.uri);
        filesToProcess.push(r);
      }
    }

    try {
      // 2. Build the bundled content
      // We use a simple string concatenation to ensure raw content is preserved
      let bundleContent = "";

      for (const file of filesToProcess) {
        try {
          const uri = vscode.Uri.parse(file.uri);
          
          // Read file content using VS Code API (handles remote/virtual files)
          const data = await vscode.workspace.fs.readFile(uri);
          const content = new TextDecoder().decode(data);
          
          // Get clean relative path for the attribute
          const relativePath = vscode.workspace.asRelativePath(uri, false);

          // 3. Append raw content wrapped in tags
          // No XML escaping is performed on 'content' to preserve code integrity (&&, <, >)
          bundleContent += `<file path="${relativePath}">\n${content}\n</file>\n\n`;
        } catch (_e) {
          this.logger.log(`Failed to read file for bundling: ${file.filePath}`, "ERROR");
          bundleContent += `<file path="${file.filePath}">\n[Error reading file]\n</file>\n\n`;
        }
      }

      // 4. Write to a temporary file
      const tempDir = os.tmpdir();
      // Use .txt or .xml extension so LLMs recognize it as text/code
      const tempFilePath = path.join(tempDir, `context-bundle-${Date.now()}.txt`);
      
      await fs.promises.writeFile(tempFilePath, bundleContent, "utf8");

      // 5. Use ClipboardService to put the file object on the clipboard
      // This allows the user to paste it as a file attachment
      await this.clipboardService.copyFilesToClipboard([tempFilePath]);

      vscode.window.showInformationMessage(
        `Bundled ${filesToProcess.length} files into context attachment.`
      );

      this.analyticsService.trackEvent("results_copied", {
        mode: "bundle",
        count: filesToProcess.length,
        platform: process.platform,
      });

    } catch (err) {
      this.logger.log(`Failed to bundle context: ${err}`, "ERROR");
      vscode.window.showErrorMessage("Failed to create context bundle.");
    }
  }

  /**
   * Helper method to get language from file extension for syntax highlighting
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