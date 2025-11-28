import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

export interface ClipboardMessage {
  type: "clipboard_update" | "error" | "ready";
  content?: string;
  message?: string;
  timestamp?: string;
}

export class ClipboardService implements vscode.Disposable {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private process: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];
  private isStarting: boolean = false;

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
      const msg =
        "clipboard-monitor binary not found; ensure the extension includes the binary for your platform.";
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
      this.isStarting = false;
      return;
    }

    try {
      this.outputChannel.appendLine(`Spawning clipboard-monitor: ${binPath}`);

      // verify binary exists before attempting to spawn
      if (!fs.existsSync(binPath)) {
        const msg = `clipboard-monitor binary missing at ${binPath}`;
        this.outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg);
        this.isStarting = false;
        return;
      }

      this.process = spawn(binPath, [], {
        cwd: path.dirname(binPath),
        env: { ...process.env },
      });

      this.process.stdout.setEncoding("utf8");
      this.process.stderr.setEncoding("utf8");

      this.process.stdout.on("data", this.handleStdout);
      this.process.stderr.on("data", this.handleStderr);

      this.process.on("error", (err) => {
        const msg = `clipboard-monitor failed to start: ${err.message}`;
        this.outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg);
        this.cleanupProcess();
      });

      this.process.on("exit", (code, signal) => {
        const msg = `clipboard-monitor exited with code=${code} signal=${signal}`;
        this.outputChannel.appendLine(msg);
        this.cleanupProcess();
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const msg = `Failed to spawn clipboard-monitor: ${errMsg}`;
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
      this.cleanupProcess();
    } finally {
      this.isStarting = false;
    }
  }

  private handleStdout = (data: string) => {
    // stdout may deliver partial lines; split by newlines and process each line
    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      this.outputChannel.appendLine(`[clipboard-monitor stdout] ${line}`);

      // Expect JSON lines matching ClipboardMessage
      try {
        const parsed = JSON.parse(line) as ClipboardMessage;
        this.processMessage(parsed);
      } catch {
        // Not JSON — log and continue
        this.outputChannel.appendLine(
          `[clipboard-monitor] non-json stdout: ${line}`
        );
      }
    }
  };

  private handleStderr = (data: string) => {
    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      this.outputChannel.appendLine(`[clipboard-monitor stderr] ${line}`);

      // Attempt to parse as message
      try {
        const parsed = JSON.parse(line) as ClipboardMessage;
        this.processMessage(parsed);
      } catch {
        // If not structured, surface as error
        vscode.window.showErrorMessage(`Clipboard monitor error: ${line}`);
      }
    }
  };

  private processMessage(msg: ClipboardMessage) {
    switch (msg.type) {
      case "ready":
        this.outputChannel.appendLine("Clipboard monitor ready");
        // optionally notify user
        // avoid spamming; show info once
        vscode.window.showInformationMessage("Clipboard monitor started");
        break;
      case "clipboard_update":
        {
          const raw = msg.content ?? "<empty>";
          // show a preview up to 100 chars and collapse newlines to spaces
          const preview = raw.replace(/\r?\n/g, " ").slice(0, 100);
          this.outputChannel.appendLine(
            `Clipboard update (preview): ${preview}`
          );
          // show a brief notification (info) and copy to clipboard in extension if needed
          if (msg.content) {
            vscode.env.clipboard.writeText(msg.content).then(
              () => {
                // show a subtle notification
                vscode.window.showInformationMessage(
                  "Clipboard updated from system"
                );
              },
              (err) => {
                this.outputChannel.appendLine(
                  `Failed to write to VSCode clipboard: ${String(err)}`
                );
              }
            );
          }
        }
        break;
      case "error":
        this.outputChannel.appendLine(
          `Clipboard monitor reported error: ${msg.message ?? ""}`
        );
        vscode.window.showErrorMessage(
          `Clipboard monitor: ${msg.message ?? "Unknown error"}`
        );
        break;
      default:
        this.outputChannel.appendLine(
          `Unknown message type from clipboard monitor: ${
            (msg as unknown as Record<string, unknown>).type
          }`
        );
    }
  }

  private getBinaryPath(): string | null {
    /**
     * Resolves the path to the sidecar binary based on the current OS and Arch.
     * Matches the naming convention used in build-rust.js:
     * - clipboard-monitor-<platform>-<arch> (or .exe on Windows)
     * - Examples: clipboard-monitor-darwin-arm64, clipboard-monitor-win32-x64.exe
     */
    const platform = os.platform(); // 'win32', 'darwin', 'linux'
    const arch = os.arch(); // 'x64', 'arm64'

    // Generate platform-specific binary name
    let binaryName = `clipboard-monitor-${platform}-${arch}`;
    if (platform === "win32") {
      binaryName += ".exe";
    }

    const extRoot = this.context.extensionPath;

    // Primary location: bin/ directory (packaged extension)
    const primaryPath = path.join(extRoot, "bin", binaryName);

    // Fallback locations for development
    const candidates = [
      primaryPath,
      path.join(
        extRoot,
        "rust",
        "clipboard-monitor",
        "target",
        "release",
        binaryName
      ),
      path.join(
        extRoot,
        "rust",
        "clipboard-monitor",
        "target",
        "debug",
        binaryName
      ),
      path.join(extRoot, "resources", binaryName),
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch {
        // ignore and continue
      }
    }

    this.outputChannel.appendLine(
      `No clipboard-monitor binary found for ${platform}-${arch} in expected locations.`
    );
    return null;
  }

  private cleanupProcess() {
    if (this.process) {
      try {
        this.process.stdout.removeAllListeners();
        this.process.stderr.removeAllListeners();
        this.process.removeAllListeners();
        if (!this.process.killed) {
          this.process.kill();
        }
      } catch (err) {
        this.outputChannel.appendLine(
          `Error cleaning up process: ${(err as Error).message}`
        );
      }
      this.process = null;
    }
  }

  public dispose(): void {
    this.cleanupProcess();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    this.disposables = [];
  }
}
