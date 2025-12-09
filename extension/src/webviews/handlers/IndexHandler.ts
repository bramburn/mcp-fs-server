import * as vscode from "vscode";
import { IndexingService } from "../../services/IndexingService.js";
import { WorkspaceManager } from "../../services/WorkspaceManager.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  INDEX_STATUS_METHOD,
  IndexStatusParams,
  IndexStatus, // Import IndexStatus
  IpcCommand,
  IpcRequest,
  IpcResponse,
  START_INDEX_METHOD,
} from "../protocol.js";
import * as crypto from "crypto"; // Import crypto for randomUUID

export class IndexHandler implements IRequestHandler {
  constructor(
    private indexingService: IndexingService,
    private workspaceManager: WorkspaceManager
  ) {}

  public canHandle(method: string): boolean {
    return [
      START_INDEX_METHOD,
      "ipc:ready-request",
      INDEX_STATUS_METHOD // Allow frontend to poll status specifically
    ].includes(method);
  }

  public async handleRequest(
    _request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
     // If we wanted to return data directly to a request, we'd do it here.
     // Currently using notifications pattern.
     return {
         id: _request.id,
         kind: 'response',
         responseId: _request.id,
         scope: _request.scope,
         timestamp: Date.now()
     };
  }

  public async handleCommand(
    command: IpcCommand<any>,
    context: IpcContext
  ): Promise<void> {
    // Determine current status context
    const folder = this.workspaceManager.getActiveWorkspaceFolder();
    
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

    if (command.method === "ipc:ready-request" || command.method === INDEX_STATUS_METHOD) {
      if (!folder) {
          sendStatus({ status: "no_workspace" });
          return;
      }

      // Initialize service (ensure config is loaded)
      await this.indexingService.initializeForSearch(folder);

      if (this.indexingService.isIndexing) {
          sendStatus({ status: "indexing" });
          return;
      }

      // 1. Calculate Repo Identity
      const repoId = await this.indexingService.getRepoId(folder);
      const storedState = this.indexingService.getRepoIndexState(repoId);
      
      // 2. Get Current Git State
      const currentCommit = await this.workspaceManager.gitProvider?.getLastCommit(folder.uri.fsPath) || null;

      // 3. Determine Status
      let status: IndexStatus = "notIndexed";
      let vectorCount = 0;

      // Only consider "ready" or "stale" if we have a valid stored state with vectors
      if (storedState) {
          vectorCount = storedState.vectorCount;
          
          if (vectorCount > 0) {
              if (currentCommit && storedState.lastIndexedCommit !== currentCommit) {
                  status = "stale";
              } else {
                  status = "ready";
              }
          }
      } else {
          // Explicitly ensure status is notIndexed if no state exists
          status = "notIndexed";
      }

      // Optional: Get live stats from DB if we want to double check
      // const liveStats = await this.indexingService.getCollectionStats();

      sendStatus({
        status: status,
        stats: {
            vectorCount: vectorCount,
            lastCommit: storedState?.lastIndexedCommit,
            repoId: repoId
        }
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
        // Status update sent by IndexingService progress listener
      } catch (e) {
        sendStatus({ status: "error", message: String(e) });
      }
    }
  }
}
