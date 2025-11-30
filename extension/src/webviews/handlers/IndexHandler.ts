import * as vscode from "vscode";
import { IndexingService } from "../../services/IndexingService.js";
import { WorkspaceManager } from "../../services/WorkspaceManager.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  INDEX_STATUS_METHOD,
  IndexStatusParams,
  IpcCommand,
  IpcRequest,
  IpcResponse,
  START_INDEX_METHOD,
} from "../protocol.js";

export class IndexHandler implements IRequestHandler {
  constructor(
    private indexingService: IndexingService,
    private workspaceManager: WorkspaceManager
  ) {}

  public canHandle(method: string): boolean {
    return [
      START_INDEX_METHOD,
      "ipc:ready-request", // Handled here as it primarily checks index status
    ].includes(method);
  }

  public async handleRequest(
    _request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
    throw new Error("IndexHandler only handles commands");
  }

  public async handleCommand(
    command: IpcCommand<any>,
    context: IpcContext
  ): Promise<void> {
    const folder = this.workspaceManager.getActiveWorkspaceFolder();

    // Status update helper
    const sendStatus = (params: IndexStatusParams) => {
      context.postMessage({
        kind: "notification",
        id: crypto.randomUUID(),
        scope: "qdrantIndex",
        method: INDEX_STATUS_METHOD,
        timestamp: Date.now(),
        params,
      });
    };

    if (command.method === "ipc:ready-request") {
      if (folder) {
        await this.indexingService.initializeForSearch(folder);
      }
      const stats = await this.indexingService.getCollectionStats();
      sendStatus({
        status: this.indexingService.isIndexing
          ? "indexing"
          : folder
          ? "ready"
          : "no_workspace",
        stats: stats ?? undefined,
      });
      return;
    }

    if (command.method === START_INDEX_METHOD) {
      if (!folder) {
        sendStatus({ status: "no_workspace" });
        vscode.window.showErrorMessage("Open a workspace first.");
        return;
      }

      sendStatus({ status: "indexing" });
      try {
        await this.indexingService.startIndexing(folder);
        const stats = await this.indexingService.getCollectionStats();
        sendStatus({ status: "ready", stats: stats ?? undefined });
      } catch (e) {
        sendStatus({ status: "error", message: String(e) });
      }
    }
  }
}
