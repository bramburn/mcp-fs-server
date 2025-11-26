import "reflect-metadata";

import * as vscode from "vscode";
import type { AnalyticsService } from "./services/AnalyticsService.js";
import type { ConfigService } from "./services/ConfigService.js";
import type { IndexingService } from "./services/IndexingService.js";
import type { ILogger } from "./services/LoggerService.js";
import {
  disposeContainer,
  getService,
  ILOGGER_TOKEN,
  initializeServiceContainer,
} from "./services/ServiceContainer.js";
import type { WorkspaceManager } from "./services/WorkspaceManager.js";
import { WebviewController } from "./webviews/WebviewController.js";

// Maximum retry attempts for failed operations
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Helper function for retry logic with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  baseDelay: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt) {
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Helper function to validate command handlers match package.json
function validateCommandHandlers(
  registeredCommands: string[],
  expectedCommands: string[]
): boolean {
  const missingCommands = expectedCommands.filter(
    (cmd) => !registeredCommands.includes(cmd)
  );

  if (missingCommands.length > 0) {
    console.error(`Missing command handlers: ${missingCommands.join(", ")}`);
    return false;
  }

  return true;
}

// Health check function for Qdrant/Ollama connections
async function performConnectionHealthCheck(
  configService: ConfigService,
  logger: ILogger
): Promise<boolean> {
  try {
    logger.log("Performing connection health check...", "CONFIG");

    // Get active workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.log("No workspace folders available for health check", "WARN");
      return false;
    }

    const folder = workspaceFolders[0];
    const config = await configService.loadQdrantConfig(folder);

    if (!config) {
      logger.log("No configuration available for health check", "WARN");
      return false;
    }

    // Validate connections
    const isHealthy = await configService.validateConnection(config);
    logger.log(
      `Connection health check result: ${isHealthy ? "HEALTHY" : "UNHEALTHY"}`,
      "CONFIG"
    );

    return isHealthy;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.log(`Connection health check failed: ${errorMsg}`, "ERROR");
    return false;
  }
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // ========================================================================
  // STEP 1: Create output channel FIRST
  // ========================================================================
  const outputChannel = vscode.window.createOutputChannel(
    "Qdrant Code Search",
    { log: true }
  );
  context.subscriptions.push(outputChannel);
  outputChannel.show(false); // Don't steal focus

  outputChannel.appendLine("═".repeat(80));
  outputChannel.appendLine("🚀 Qdrant Code Search Extension Activating...");
  outputChannel.appendLine(`⏰ ${new Date().toISOString()}`);
  outputChannel.appendLine(`📍 Extension URI: ${context.extensionUri.fsPath}`);
  outputChannel.appendLine("═".repeat(80));

  let servicesInitialized = false;
  let webviewController: WebviewController | undefined;

  try {
    // ====================================================================
    // STEP 2: Get trace setting and initialize DI container with retry logic
    // ====================================================================
    const traceEnabled = vscode.workspace
      .getConfiguration("qdrant.search")
      .get<boolean>("trace", false);

    outputChannel.appendLine("📦 Initializing DI container...");

    // Initialize service container with retry logic
    await retryWithBackoff(async () => {
      try {
        await initializeServiceContainer(context, outputChannel, traceEnabled);
        outputChannel.appendLine("✅ DI container initialized");
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(
          `❌ Failed to initialize DI container: ${errorMsg}`
        );
        throw error;
      }
    });

    // ====================================================================
    // STEP 3: Get services from container with error handling
    // ====================================================================
    let logger: ILogger;
    let configService: ConfigService;
    let indexingService: IndexingService;
    let workspaceManager: WorkspaceManager;
    let analyticsService: AnalyticsService;

    try {
      logger = getService<ILogger>(ILOGGER_TOKEN);
      logger.log("📥 Retrieved ILogger from container", "CONFIG");

      configService = getService<ConfigService>("ConfigService");
      logger.log("📥 Retrieved ConfigService from container", "CONFIG");

      indexingService = getService<IndexingService>("IndexingService");
      logger.log("📥 Retrieved IndexingService from container", "CONFIG");

      workspaceManager = getService<WorkspaceManager>("WorkspaceManager");
      logger.log("📥 Retrieved WorkspaceManager from container", "CONFIG");

      analyticsService = getService<AnalyticsService>("AnalyticsService");
      logger.log("📥 Retrieved AnalyticsService from container", "CONFIG");

      servicesInitialized = true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      outputChannel.appendLine(
        `❌ Failed to retrieve one or more services from container: ${err.message}`
      );
      outputChannel.appendLine(
        "The DI container may be in a partially initialized state; attempting cleanup..."
      );
      try {
        await disposeContainer();
        outputChannel.appendLine(
          "✅ Partial service initialization cleaned up"
        );
      } catch (cleanupError) {
        const cleanupErrorMsg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        outputChannel.appendLine(
          `❌ Cleanup after failed service resolution also failed: ${cleanupErrorMsg}`
        );
      }
      throw err;
    }

    // ====================================================================
    // STEP 4: Validate configuration before using services
    // ====================================================================
    try {
      const config = configService.config;
      if (!config) {
        throw new Error("Configuration is null or undefined");
      }

      // Validate critical configuration fields
      if (!config.indexing || !config.search) {
        throw new Error(
          "Missing critical configuration sections (indexing or search)"
        );
      }

      logger.log("✅ Configuration validation passed", "CONFIG");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.log(`❌ Configuration validation failed: ${errorMsg}`, "ERROR");
      throw new Error(`Configuration validation failed: ${errorMsg}`);
    }

    // ====================================================================
    // STEP 5: Create status bar item
    // ====================================================================
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = "$(database) Qdrant: Ready";
    statusBarItem.tooltip = "Qdrant Code Search Status";
    statusBarItem.command = "qdrant.openSettings";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ====================================================================
    // STEP 6: Create and register webview provider with error handling
    // ====================================================================
    logger.log("🖼️ Creating WebviewController", "WEBVIEW");

    try {
      webviewController = new WebviewController(
        context.extensionUri,
        indexingService,
        workspaceManager,
        configService,
        analyticsService,
        logger
      );

      logger.log("📋 Registering webview provider", "WEBVIEW");
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
      logger.log("✅ Webview provider registered", "WEBVIEW");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.log(`❌ Failed to initialize webview: ${errorMsg}`, "ERROR");
      throw new Error(`Webview initialization failed: ${errorMsg}`);
    }

    // ====================================================================
    // STEP 7: Register commands with validation
    // ====================================================================
    const registeredCommands = registerCommands(
      context,
      logger,
      indexingService,
      workspaceManager,
      analyticsService,
      statusBarItem
    );

    // Validate that all expected commands are registered
    const expectedCommands = ["qdrant.index.start", "qdrant.openSettings"];

    if (!validateCommandHandlers(registeredCommands, expectedCommands)) {
      throw new Error("Command validation failed - missing command handlers");
    }

    logger.log("✅ All commands registered and validated", "CONFIG");

    // ====================================================================
    // STEP 8: Perform connection health check with retry logic
    // ====================================================================
    try {
      const isHealthy = await retryWithBackoff(
        () => performConnectionHealthCheck(configService, logger),
        2, // Fewer retries for health check
        500 // Shorter delay
      );

      if (isHealthy) {
        logger.log("✅ Connection health check passed", "CONFIG");
      } else {
        logger.log(
          "⚠️ Connection health check failed, but continuing with degraded functionality",
          "WARN"
        );
        statusBarItem.text = "$(database) Qdrant: Degraded";
        statusBarItem.tooltip =
          "Qdrant Code Search - Connection Issues Detected";
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.log(
        `⚠️ Connection health check failed with error: ${errorMsg}`,
        "WARN"
      );
      statusBarItem.text = "$(database) Qdrant: Degraded";
      statusBarItem.tooltip = "Qdrant Code Search - Connection Issues Detected";
    }

    outputChannel.appendLine("═".repeat(80));
    outputChannel.appendLine("🎉 Extension Ready!");
    outputChannel.appendLine("═".repeat(80));

    // ====================================================================
    // STEP 9: Global error handlers
    // ====================================================================
    let errorHandlerActive = false;

    process.on("uncaughtException", (err: Error) => {
      // Prevent recursive error handling
      if (errorHandlerActive) {
        console.error(
          "[FATAL] Recursive error in uncaughtException handler:",
          err
        );
        return;
      }
      errorHandlerActive = true;

      const timestamp = new Date().toISOString();
      const message = err.message;
      const stack = err.stack ?? "No stack";

      try {
        logger.log(
          `UNCAUGHT EXCEPTION at ${timestamp}: ${message}\n${stack}`,
          "FATAL"
        );
        outputChannel.appendLine(
          `[FATAL] Uncaught exception at ${timestamp}: ${message}`
        );
        outputChannel.appendLine(`[FATAL] Stack: ${stack}`);

        const isNetworkError =
          message.includes("ECONNRESET") ||
          message.includes("connection reset") ||
          message.includes("network") ||
          message.includes("fetch");

        if (isNetworkError) {
          outputChannel.appendLine(
            `[FATAL] NETWORK ERROR DETECTED - Type: ${err.name}`
          );
        }

        try {
          analyticsService.trackError(
            "global.uncaught",
            `${message} | Type: ${err.name} | Network: ${isNetworkError}`
          );
        } catch (analyticsError) {
          outputChannel.appendLine(
            `[FATAL] Error within uncaughtException handler: ${analyticsError}`
          );
        }
      } finally {
        errorHandlerActive = false;
      }
    });

    process.on("unhandledRejection", (reason: unknown) => {
      // Prevent recursive error handling
      if (errorHandlerActive) {
        console.error(
          "[FATAL] Recursive error in unhandledRejection handler:",
          reason
        );
        return;
      }
      errorHandlerActive = true;

      const timestamp = new Date().toISOString();
      const error =
        reason instanceof Error ? reason : new Error(String(reason));
      const message = error.message;
      const stack = error.stack ?? "No stack";

      try {
        logger.log(
          `UNHANDLED REJECTION at ${timestamp}: ${message}\n${stack}`,
          "FATAL"
        );
        outputChannel.appendLine(
          `[FATAL] Unhandled promise rejection at ${timestamp}: ${message}`
        );
        outputChannel.appendLine(`[FATAL] Stack: ${stack}`);

        const isNetworkError =
          message.includes("ECONNRESET") ||
          message.includes("connection reset") ||
          message.includes("network") ||
          message.includes("fetch");

        if (isNetworkError) {
          outputChannel.appendLine(
            `[FATAL] NETWORK ERROR in promise rejection - Type: ${error.name}`
          );
        }

        try {
          analyticsService.trackError(
            "global.unhandledRejection",
            `${message} | Type: ${error.name} | Network: ${isNetworkError}`
          );
        } catch (analyticsError) {
          outputChannel.appendLine(
            `[FATAL] Error within unhandledRejection handler: ${analyticsError}`
          );
        }
      } finally {
        errorHandlerActive = false;
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";

    outputChannel.appendLine("❌ CRITICAL ERROR DURING ACTIVATION");
    outputChannel.appendLine(`📌 ${errorMsg}`);
    if (errorStack) {
      outputChannel.appendLine("Stack trace:");
      outputChannel.appendLine(errorStack);
    }

    // If services were initialized but activation failed, try to clean up
    if (servicesInitialized) {
      try {
        outputChannel.appendLine(
          "🧹 Attempting to clean up partially initialized services..."
        );
        await disposeContainer();
        outputChannel.appendLine("✅ Service cleanup completed");
      } catch (cleanupError) {
        const cleanupErrorMsg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        outputChannel.appendLine(
          `❌ Service cleanup failed: ${cleanupErrorMsg}`
        );
      }
    }

    vscode.window.showErrorMessage(
      `Failed to activate Qdrant Code Search: ${errorMsg}`
    );
    throw error;
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  logger: ILogger,
  indexingService: IndexingService,
  workspaceManager: WorkspaceManager,
  analyticsService: AnalyticsService,
  statusBarItem: vscode.StatusBarItem
): string[] {
  const registeredCommands: string[] = [];
  // qdrant.index.start
  logger.log("Registering command: qdrant.index.start", "COMMAND");
  context.subscriptions.push(
    vscode.commands.registerCommand("qdrant.index.start", async () => {
      logger.log("qdrant.index.start invoked", "COMMAND");
      analyticsService.trackCommand("qdrant.index.start");

      const folder = workspaceManager.getActiveWorkspaceFolder();
      if (!folder) {
        logger.log("No workspace folder found", "ERROR");
        vscode.window.showErrorMessage("No workspace folder found");
        analyticsService.trackError(
          "no_workspace_folder",
          "qdrant.index.start"
        );
        return;
      }

      statusBarItem.text = "$(sync~spin) Qdrant: Indexing...";
      const startTime = Date.now();

      try {
        await retryWithBackoff(
          () => indexingService.startIndexing(folder),
          2, // Fewer retries for indexing
          1000 // 1 second delay
        );

        const duration = Date.now() - startTime;
        statusBarItem.text = "$(database) Qdrant: Ready";
        vscode.window.showInformationMessage("Workspace indexed successfully!");

        analyticsService.trackIndexing({
          duration,
          success: true,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);

        statusBarItem.text = "$(database) Qdrant: Error";
        vscode.window.showErrorMessage(`Indexing failed: ${errorMsg}`);
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
  registeredCommands.push("qdrant.index.start");

  // qdrant.openSettings
  logger.log("Registering command: qdrant.openSettings", "COMMAND");
  context.subscriptions.push(
    vscode.commands.registerCommand("qdrant.openSettings", () => {
      logger.log("qdrant.openSettings invoked", "COMMAND");
      analyticsService.trackCommand("qdrant.openSettings");
      vscode.commands.executeCommand("workbench.action.openSettings", "qdrant");
    })
  );
  registeredCommands.push("qdrant.openSettings");

  return registeredCommands;
}

export async function deactivate(): Promise<void> {
  console.log("Deactivating Qdrant Code Search Extension...");

  try {
    // Improved extension context cleanup
    await disposeContainer();
    console.log("✅ Extension cleanup completed successfully");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error during extension deactivation: ${errorMsg}`);
  }
}
