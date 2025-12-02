import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { IndexingService } from "./IndexingService.js"; // Import IndexingService

export interface ClipboardMessage {
  type: "clipboard_update" | "error" | "ready" | "trigger_search";
  content?: string;
  message?: string;
  timestamp?: string;
  query?: string; // For trigger_search
}

export class ClipboardService implements vscode.Disposable {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private process: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];
  private isStarting: boolean = false;
  
  // Dependency Injection for performing searches
  private indexingService?: IndexingService;

  constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  // Setter for IndexingService to avoid circular dependency in Container
  public setIndexingService(service: IndexingService) {
      this.indexingService = service;
  }

  public start(): void {
    if (this.process || this.isStarting) {
      return;
    }
    this.isStarting = true;

    const binPath = this.getBinaryPath();
    if (!binPath) {
      const msg = "clipboard-monitor binary not found.";
      this.outputChannel.appendLine(msg);
      this.isStarting = false;
      return;
    }

    try {
      this.process = spawn(binPath, [], {
        cwd: path.dirname(binPath),
        env: { ...process.env },
      });

      this.process.stdout.setEncoding("utf8");
      this.process.stderr.setEncoding("utf8");

      this.process.stdout.on("data", this.handleStdout);
      this.process.stderr.on("data", (d) => this.outputChannel.appendLine(d));

      this.process.on("error", (err) => {
        this.outputChannel.appendLine(`clipboard-monitor error: ${err.message}`);
        this.cleanupProcess();
      });

      this.process.on("exit", (code) => {
        this.outputChannel.appendLine(`clipboard-monitor exited code=${code}`);
        this.cleanupProcess();
      });
    } catch (err: unknown) {
      this.outputChannel.appendLine(`Failed to spawn clipboard-monitor: ${err}`);
      this.cleanupProcess();
    } finally {
      this.isStarting = false;
    }
  }

  private handleStdout = async (data: string) => {
    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const msg = JSON.parse(line) as ClipboardMessage;
        await this.processMessage(msg);
      } catch {
        this.outputChannel.appendLine(`[clipboard-monitor raw]: ${line}`);
      }
    }
  };

  private async processMessage(msg: ClipboardMessage) {
    switch (msg.type) {
      case "ready":
        this.outputChannel.appendLine("Clipboard monitor ready");
        break;
        
      case "clipboard_update":
        // Notify webview store if needed (this would require an event emitter or callback)
        // For P1, we primarily use this log. 
        // In P2, we should emit this event so the React Store can add it to 'clipboardHistory'.
        this.outputChannel.appendLine(`Clipboard copied: ${msg.content?.substring(0, 50)}...`);
        break;
        
      case "trigger_search":
        if (msg.query) {
            await this.handleSearchTrigger(msg.query);
        }
        break;
        
      case "error":
        this.outputChannel.appendLine(`Monitor Error: ${msg.message}`);
        break;
    }
  }

  private async handleSearchTrigger(query: string) {
      if (!this.indexingService) {
          vscode.window.showWarningMessage("Search triggered but IndexingService not available.");
          return;
      }

      this.outputChannel.appendLine(`[TRIGGER] Executing search for: "${query}"`);
      
      try {
        // Execute search
        const results = await this.indexingService.search(query, { limit: 5 });
        
        if (results.length === 0) {
            vscode.window.showInformationMessage(`No results found for: ${query}`);
            return;
        }

        // Format results for clipboard
        let buffer = `// Search Results for: "${query}"\n\n`;
        for (const r of results) {
            const relPath = r.payload.filePath; // path is absolute in payload usually, need relative?
            buffer += `// File: ${relPath} (Lines ${r.payload.lineStart}-${r.payload.lineEnd})\n`;
            buffer += `\`\`\`${path.extname(relPath).substring(1)}\n`;
            buffer += `${r.payload.content}\n`;
            buffer += `\`\`\`\n\n`;
        }

        // Write back to clipboard
        await vscode.env.clipboard.writeText(buffer);
        
        // Show notification (This mimics "Desktop Notification" via VS Code API which shows system toast on many OSs)
        vscode.window.showInformationMessage(
            `Search results for "${query}" copied to clipboard!`, 
            "View in Editor"
        ).then(selection => {
            if (selection === "View in Editor") {
                // Optional: Open a new file with results
            }
        });

      } catch (err) {
          this.outputChannel.appendLine(`Search trigger failed: ${err}`);
          vscode.window.showErrorMessage("Failed to execute clipboard search trigger.");
      }
  }

  // ... (copyFilesToClipboard, getBinaryPath, cleanupProcess, dispose - same as before)
  public async copyFilesToClipboard(filePaths: string[]): Promise<void> {
    // Implementation kept from previous file...
    // Re-implemented briefly for completeness of this file block
    if (!filePaths.length) return;
    const uniqueFilePaths = [...new Set(filePaths)];
    const binPath = this.getBinaryPath("clipboard-files");
    if (!binPath) return;

    return new Promise((resolve, reject) => {
      const proc = spawn(binPath, uniqueFilePaths, {
        cwd: path.dirname(binPath),
        env: { ...process.env },
        shell: os.platform() === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`clipboard-files exited with ${code}`));
      });
    });
  }

  private getBinaryPath(binaryName: string = "clipboard-monitor"): string | null {
    const platform = os.platform(); 
    const arch = os.arch(); 
    let fileName = `${binaryName}-${platform}-${arch}`;
    if (platform === "win32") fileName += ".exe";

    const extRoot = this.context.extensionPath;
    const candidates = [
      path.join(extRoot, "bin", fileName),
      path.join(extRoot, "rust", binaryName, "target", "release", platform === "win32" ? `${binaryName}.exe` : binaryName),
      path.join(extRoot, "resources", fileName),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private cleanupProcess() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  public dispose(): void {
    this.cleanupProcess();
    for (const d of this.disposables) d.dispose();
  }
}