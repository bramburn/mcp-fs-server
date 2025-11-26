import * as vscode from "vscode";
import {
  Container,
  initializeServices,
  useService,
} from "./container/Container.js";
import { WebviewController } from "./webviews/WebviewController.js";

import type { ILogger } from "./services/LoggerService.js";

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel with log flag for auto-categorization
  const outputChannel = vscode.window.createOutputChannel(
    "Qdrant Code Search",
    { log: true }
  );
  context.subscriptions.push(outputChannel);

  // IMPORTANT: Show it immediately so user sees logs
  outputChannel.show(false); // false = don't steal focus

  // Add timestamp and startup message
  outputChannel.appendLine(
    "════════════════════════════════════════════════════════"
  );
  outputChannel.appendLine(`🚀 Qdrant Code Search Extension Starting...`);
  outputChannel.appendLine(`📅 Time: ${new Date().toISOString()}`);
  outputChannel.appendLine(`📍 Extension URI: ${context.extensionUri.fsPath}`);
  outputChannel.appendLine(
    "════════════════════════════════════════════════════════"
  );

  const traceEnabled = vscode.workspace
    .getConfiguration("qdrant.search")
    .get("trace", false) as boolean;

  try {
    outputChannel.appendLine(
      "[INFO] Initializing DI container and services..."
    );
    // Initialize DI container with all services, passing necessary context for LoggerService
    initializeServices(context, outputChannel, traceEnabled);
    outputChannel.appendLine(
      "[INFO] DI container and services initialized successfully."
    );

    // Retrieve services from container
    outputChannel.appendLine("[INFO] Retrieving services from container...");
    const configService = useService("ConfigService");
    const indexingService = useService("IndexingService");
    const workspaceManager = useService("WorkspaceManager");
    const analyticsService = useService("AnalyticsService");
    const logger: ILogger = useService("LoggerService"); // Get the injected logger
    logger.log("Services retrieved from container.");

    // Create webview controller
    const webviewController = new WebviewController(
      context.extensionUri,
      indexingService,
      workspaceManager,
      configService,
      analyticsService,
      outputChannel,
      logger // Inject logger as 7th argument
    );
    logger.log("WebviewController created.");

    // Register webview provider FIRST and SYNCHRONOUSLY before any other operations
    // This ensures the provider is available when the view is activated
    analyticsService.trackEvent("provider.beforeRegister", {
      viewType: WebviewController.viewType,
    });
    logger.log(
      `Registering webview provider for ${WebviewController.viewType}`
    );

    try {
      const webviewProviderDisposable =
        vscode.window.registerWebviewViewProvider(
          WebviewController.viewType,
          webviewController,
          {
            webviewOptions: {
              retainContextWhenHidden: true,
            },
          }
        );
      context.subscriptions.push(webviewProviderDisposable);
      logger.log(
        `Webview provider registered successfully for ${WebviewController.viewType}`
      );
      analyticsService.trackEvent("provider.registered", {
        success: true,
        viewType: WebviewController.viewType,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.log(
        `Failed to register webview provider: ${errorMsg} | viewType=${WebviewController.viewType}`,
        "ERROR"
      );
      analyticsService.trackError(
        "provider.register.failed",
        errorMsg + " | viewType=" + WebviewController.viewType
      );
    }

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = "$(database) Qdrant: Ready";
    statusBarItem.tooltip = "Qdrant Code Search Status";
    statusBarItem.command = "qdrant.openSettings";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    logger.log("Registering command: qdrant.index.start");
    context.subscriptions.push(
      vscode.commands.registerCommand("qdrant.index.start", async () => {
        logger.log("qdrant.index.start invoked", "COMMAND");
        analyticsService.trackCommand("qdrant.index.start");

        const folder = workspaceManager.getActiveWorkspaceFolder();
        if (!folder) {
          vscode.window.showErrorMessage("No workspace folder found");
          analyticsService.trackError(
            "no_workspace_folder",
            "qdrant.index.start"
          );
          return;
        }

        // Update status
        statusBarItem.text = "$(sync~spin) Qdrant: Indexing...";
        const startTime = Date.now();

        try {
          await indexingService.startIndexing(folder);
          const duration = Date.now() - startTime;
          statusBarItem.text = "$(database) Qdrant: Ready";
          vscode.window.showInformationMessage(
            "Workspace indexed successfully!"
          );

          analyticsService.trackIndexing({
            duration,
            success: true,
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          statusBarItem.text = "$(database) Qdrant: Error";
          vscode.window.showErrorMessage(`Indexing failed: ${error}`);
          logger.log(
            `Indexing failed: ${errorMsg} (duration: ${duration}ms)`,
            "ERROR"
          );

          analyticsService.trackIndexing({
            duration,
            success: false,
          });
          analyticsService.trackError("indexing_failed", "qdrant.index.start");
        }
      })
    );

    logger.log("Registering command: qdrant.openSettings");
    context.subscriptions.push(
      vscode.commands.registerCommand("qdrant.openSettings", () => {
        logger.log("qdrant.openSettings invoked", "COMMAND");
        analyticsService.trackCommand("qdrant.openSettings");
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "qdrant"
        );
      })
    );

    // Don't send initial status here - webview may not be created yet
    // The webview will request initial state when it's ready via ipc:ready-request
    logger.log("Qdrant Code Search extension activated successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(
      `[ERROR] Failed to activate Qdrant Code Search extension: ${errorMessage}`
    );
    console.error("Failed to activate Qdrant Code Search extension:", error);
    // AnalyticsService might not be available yet, so use outputChannel for critical errors
    outputChannel.appendLine(
      `[ERROR] AnalyticsService not available for tracking activation failure.`
    );
    vscode.window.showErrorMessage(
      `Failed to activate Qdrant Code Search: ${errorMessage}`
    );
    throw error;
  }

  // Global error handler for unexpected errors in the extension host
  process.on("uncaughtException", (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    const timestamp = new Date().toISOString();

    // Use outputChannel directly for FATAL errors before logger is fully available/reliable
    outputChannel.appendLine(
      `[FATAL] Uncaught exception in extension host at ${timestamp}: ${error.message}`
    );
    outputChannel.appendLine(`[FATAL] Error type: ${error.name}`);
    outputChannel.appendLine(
      `[FATAL] Error stack: ${error.stack || "No stack available"}`
    );

    // Enhanced error details for network-related issues
    if (
      error.message.includes("ECONNRESET") ||
      error.message.includes("connection reset") ||
      error.message.includes("network") ||
      error.message.includes("fetch")
    ) {
      outputChannel.appendLine(
        `[FATAL] NETWORK ERROR DETECTED - Type: ${error.name}`
      );
      outputChannel.appendLine(
        `[FATAL] Network error details: ${error.message}`
      );

      // Try to extract additional context from the error
      if (error.stack) {
        const stackLines = error.stack.split("\n");
        outputChannel.appendLine(`[FATAL] Stack trace (first 5 lines):`);
        for (let i = 0; i < Math.min(5, stackLines.length); i++) {
          outputChannel.appendLine(`  ${stackLines[i]}`);
        }
      }

      // Log system state at time of error
      outputChannel.appendLine(
        `[FATAL] Extension context available: ${!!context}`
      );
      outputChannel.appendLine(
        `[FATAL] Workspace folders: ${
          vscode.workspace.workspaceFolders?.length || 0
        }`
      );
      outputChannel.appendLine(
        `[FATAL] Active text editor: ${!!vscode.window.activeTextEditor}`
      );
    }

    console.error("Uncaught exception in extension host", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      timestamp,
      isNetworkError:
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch"),
    });

    // Analytics tracking is risky here, but we attempt it if AnalyticsService is available
    try {
      useService("AnalyticsService").trackError(
        "global.uncaught",
        `${error.message} | Type: ${error.name} | Network: ${
          error.message.includes("ECONNRESET") ||
          error.message.includes("connection reset") ||
          error.message.includes("network") ||
          error.message.includes("fetch")
        }`
      );
    } catch (error) {
      outputChannel.appendLine(
        `[ERROR] Could not track uncaught exception via AnalyticsService. error: ${error}`
      );
    }

    // Try to show user-friendly error message for network issues
    if (
      error.message.includes("ECONNRESET") ||
      error.message.includes("connection reset")
    ) {
      vscode.window
        .showErrorMessage(
          "Network connection reset detected. This may be due to Qdrant/Ollama service issues. Please check if these services are running and accessible.",
          "Check Services"
        )
        .then((selection) => {
          if (selection === "Check Services") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "qdrant"
            );
          }
        });
    }
  });

  // Also handle unhandled promise rejections
  process.on("unhandledRejection", (reason: unknown) => {
    const timestamp = new Date().toISOString();
    const reasonStr = reason instanceof Error ? reason.message : String(reason);
    const reasonObj =
      reason instanceof Error ? reason : new Error(String(reason));

    outputChannel.appendLine(
      `[FATAL] Unhandled promise rejection at ${timestamp}: ${reasonStr}`
    );
    outputChannel.appendLine(`[FATAL] Rejection type: ${reasonObj.name}`);
    if (reasonObj.stack) {
      outputChannel.appendLine(`[FATAL] Rejection stack: ${reasonObj.stack}`);
    }

    // Enhanced error details for network-related issues
    if (
      reasonStr.includes("ECONNRESET") ||
      reasonStr.includes("connection reset") ||
      reasonStr.includes("network") ||
      reasonStr.includes("fetch")
    ) {
      outputChannel.appendLine(
        `[FATAL] NETWORK ERROR in promise rejection - Type: ${reasonObj.name}`
      );
      outputChannel.appendLine(
        `[FATAL] Network rejection details: ${reasonStr}`
      );
    }

    console.error("Unhandled promise rejection", {
      reason: reasonStr,
      name: reasonObj.name,
      stack: reasonObj.stack,
      timestamp,
      isNetworkError:
        reasonStr.includes("ECONNRESET") ||
        reasonStr.includes("connection reset") ||
        reasonStr.includes("network") ||
        reasonStr.includes("fetch"),
    });

    // Analytics tracking is risky here, but we attempt it if AnalyticsService is available
    try {
      useService("AnalyticsService").trackError(
        "global.unhandledRejection",
        `${reasonStr} | Type: ${reasonObj.name} | Network: ${
          reasonStr.includes("ECONNRESET") ||
          reasonStr.includes("connection reset") ||
          reasonStr.includes("network") ||
          reasonStr.includes("fetch")
        }`
      );
    } catch (error) {
      outputChannel.appendLine(
        `[ERROR] Could not track unhandled rejection via AnalyticsService.`
      );
      outputChannel.appendLine(`[ERROR] Rejection tracking error: ${error}`);
    }
  });
}

export async function deactivate() {
  // Properly dispose all services in reverse dependency order
  await Container.instance.dispose();
}
