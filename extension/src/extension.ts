import * as vscode from "vscode";
import { Container } from "./container/Container.js";
import { WebviewController } from "./webviews/WebviewController.js";
import { RemoteAwareFileSystem } from "./services/RemoteAwareFileSystem.js";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Qdrant Code Search",
    { log: true }
  );
  context.subscriptions.push(outputChannel);

  const traceEnabled = vscode.workspace
    .getConfiguration("qdrant.search")
    .get<boolean>("trace", false);

  const container = Container.create(context, outputChannel, traceEnabled);
  context.subscriptions.push(container);

  await container.ready;

  const webviewController = new WebviewController(
    context.extensionUri,
    container.indexingService,
    container.workspaceManager,
    container.configService,
    container.analyticsService,
    container.logger,
    container.clipboardService
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      WebviewController.viewType,
      webviewController,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Create RemoteAwareFileSystem instance for testing
  const fsHelper = new RemoteAwareFileSystem();

  context.subscriptions.push(
    vscode.commands.registerCommand("qdrant.index.start", async () => {
      const folder = container.workspaceManager.getActiveWorkspaceFolder();
      if (folder) {
        try {
          await container.indexingService.startIndexing(folder);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          container.logger.log(`Indexing failed: ${message}`, "ERROR");
          vscode.window.showErrorMessage(`Indexing failed: ${message}`);
        }
      } else {
        vscode.window.showErrorMessage("No workspace folder found.");
      }
    }),
    vscode.commands.registerCommand("qdrant.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "qdrant");
    }),
    vscode.commands.registerCommand("qdrant.test.captureBinary", async () => {
      try {
        // Show environment info first
        const envInfo = fsHelper.getEnvironmentInfo();
        container.logger.log(`Environment: ${JSON.stringify(envInfo, null, 2)}`, "INFO");

        // Ask user for file path
        const pathInput = await vscode.window.showInputBox({
          prompt: "Enter path to any file (text or binary) to test remote-aware reading",
          placeHolder: envInfo.workspaceFolders.length > 0
            ? envInfo.workspaceFolders[0] + "/README.md"
            : "/path/to/file"
        });

        if (!pathInput) return;

        // Check if file exists
        const exists = await fsHelper.fileExists(pathInput);
        if (!exists) {
          vscode.window.showErrorMessage(`File not found: ${pathInput}`);
          return;
        }

        // Get file stats
        const stats = await fsHelper.getFileStats(pathInput);
        container.logger.log(`File stats: size=${stats.size} bytes, type=${stats.type}`, "INFO");

        // Read file (will detect if binary or text automatically)
        const fileData: Uint8Array = await fsHelper.readBinaryFile(pathInput);

        // Convert to base64 for safe display/logging
        const base64Content = Buffer.from(fileData).toString('base64');
        const preview = base64Content.substring(0, 100) + (base64Content.length > 100 ? '...' : '');

        vscode.window.showInformationMessage(
          `Successfully captured ${fileData.byteLength} bytes from ${envInfo.isRemote ? 'remote' : 'local'} file!`
        );

        // Show detailed info in output channel
        container.logger.log(`File captured successfully:`, "INFO");
        container.logger.log(`  Path: ${pathInput}`, "INFO");
        container.logger.log(`  Size: ${fileData.byteLength} bytes`, "INFO");
        container.logger.log(`  Environment: ${envInfo.isRemote ? 'Remote' : 'Local'} (${envInfo.remoteName || 'local'})`, "INFO");
        container.logger.log(`  Base64 preview: ${preview}`, "INFO");

        // Optional: Test text reading if it seems like a text file
        if (fileData.byteLength < 10000) { // Only try text reading for smaller files
          try {
            const textContent = await fsHelper.readTextFile(pathInput);
            const textPreview = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
            container.logger.log(`  Text preview: ${textPreview}`, "INFO");
          } catch {
            container.logger.log(`  Note: File appears to be binary data`, "INFO");
          }
        }

      } catch (err: any) {
        container.logger.log(`Error capturing file: ${err.message}`, "ERROR");
        vscode.window.showErrorMessage(`Failed to capture file: ${err.message}`);
      }
    })
  );

  container.logger.log("Qdrant Code Search activated", "INFO");
}

export async function deactivate(): Promise<void> {
  Container.instance?.dispose();
}
