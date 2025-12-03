import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

// Define the updated message types matching Rust protocol
export interface ClipboardMessage {
  type: "clipboard_update" | "error" | "ready" | "trigger_xml";
  content?: string;
  message?: string;
  timestamp?: string;
  xml_payloads?: string[]; // New field for XML trigger
}

export class ClipboardService implements vscode.Disposable {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private process: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];
  private isStarting: boolean = false;
  
  // Event Emitter for XML Triggers
  private _onTriggerXml = new vscode.EventEmitter<string[]>();
  public readonly onTriggerXml = this._onTriggerXml.event;

  // Event Emitter for General Clipboard Updates
  private _onClipboardUpdate = new vscode.EventEmitter<string>();
  public readonly onClipboardUpdate = this._onClipboardUpdate.event;

  constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.context = context;
    this.outputChannel = outputChannel;
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
        this.outputChannel.appendLine(`Clipboard copied: ${msg.content?.substring(0, 50)}...`);
        if (msg.content) {
            this._onClipboardUpdate.fire(msg.content);
        }
        break;
        
      case "trigger_xml":
        if (msg.xml_payloads && msg.xml_payloads.length > 0) {
            this.outputChannel.appendLine(`[TRIGGER] Detected ${msg.xml_payloads.length} XML actions.`);
            // Fire the event for the ClipboardManager to handle
            this._onTriggerXml.fire(msg.xml_payloads);
        }
        break;
        
      case "error":
        this.outputChannel.appendLine(`Monitor Error: ${msg.message}`);
        break;
    }
  }

  // ... (copyFilesToClipboard, getBinaryPath kept as is from previous version)
  public async copyFilesToClipboard(filePaths: string[]): Promise<void> {
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
    this._onTriggerXml.dispose();
    this._onClipboardUpdate.dispose();
    for (const d of this.disposables) d.dispose();
  }
}