import * as vscode from "vscode";
import { Container } from "./container/Container.js";
import { WebviewController } from "./webviews/WebviewController.js";

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
    container.logger
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
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "qdrant"
      );
    })
  );

  container.logger.log("Qdrant Code Search activated", "INFO");
}

export async function deactivate(): Promise<void> {
  Container.instance?.dispose();
}