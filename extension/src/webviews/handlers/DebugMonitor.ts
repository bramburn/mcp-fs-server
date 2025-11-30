import * as vscode from "vscode";
import { ILogger } from "../../services/LoggerService.js";
import { IpcContext } from "../ipc/IpcRouter.js"; // Removed unused IpcRouter import
// import { DEBUG_ANALYZE_METHOD } from '../protocol.js'; // Retain DEBUG_ANALYZE_METHOD for context if needed, but we can remove it as it's not used. Let's remove it for clean imports.
// import { DEBUG_ANALYZE_METHOD } from '../protocol.js'; // Removed unused import

/**
 * Monitors VS Code host events (like active editor changes) and notifies
 * the debugger webview to refresh its active file analysis.
 */
export class DebugMonitor implements vscode.Disposable {
  private readonly disposable: vscode.Disposable;
  private readonly context: IpcContext;
  private isWebviewReady = false;

  constructor(private readonly logger: ILogger, context: IpcContext) {
    this.context = context;

    // 1. Subscribe to active text editor changes
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(
      () => {
        this.handleEditorChange();
      }
    );

    // 2. Subscribe to diagnostics changes (to update error count instantly)
    // Note: Diagnostics change rapidly, so we debounce this slightly if possible.
    // For simplicity, we trigger the refresh immediately.
    const diagnosticsChangeListener = vscode.languages.onDidChangeDiagnostics(
      () => {
        this.handleEditorChange();
      }
    );

    this.disposable = vscode.Disposable.from(
      editorChangeListener,
      diagnosticsChangeListener
    );

    // Send an initial update when the monitor is created (i.e., when the webview is opened)
    setTimeout(() => this.handleEditorChange(), 500);
  }

  /**
   * Called by the WebviewController when the webview is fully loaded.
   */
  public setWebviewReady() {
    this.isWebviewReady = true;
    this.handleEditorChange();
  }

  private handleEditorChange() {
    if (this.isWebviewReady) {
      this.logger.log(
        "[DEBUG_MONITOR] Active editor or diagnostics changed. Requesting analysis refresh.",
        "WEBVIEW"
      );

      // Send a command to the webview to execute the DEBUG_ANALYZE_METHOD immediately.
      // We use a command/notification here instead of a request to avoid host->guest lag.
      this.context.postMessage({
        kind: "notification",
        id: crypto.randomUUID(),
        scope: "debugger",
        method: "debug/refresh-analysis", // Custom command for immediate refresh
        timestamp: Date.now(),
        params: {},
      });
    }
  }

  public dispose() {
    this.disposable.dispose();
  }
}
