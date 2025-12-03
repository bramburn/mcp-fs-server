import * as vscode from "vscode";
import { ClipboardManager } from "../../services/ClipboardManager.js";
import { IndexingService } from "../../services/IndexingService.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  IpcCommand,
  IpcRequest,
  IpcResponse,
  MONITOR_START_COMMAND,
  MONITOR_STOP_COMMAND,
  VECTORIZE_GUIDANCE_COMMAND,
  VIEW_CONTENT_COMMAND
} from "../protocol.js";

export class ClipboardHandler implements IRequestHandler {
  constructor(
    private clipboardManager: ClipboardManager,
    private indexingService: IndexingService
  ) {}

  public canHandle(method: string): boolean {
    return [
      MONITOR_START_COMMAND,
      MONITOR_STOP_COMMAND,
      VECTORIZE_GUIDANCE_COMMAND,
      VIEW_CONTENT_COMMAND
    ].includes(method);
  }

  public async handleRequest(
    _request: IpcRequest<any>,
    _context: IpcContext
  ): Promise<IpcResponse<any>> {
      throw new Error("ClipboardHandler only handles commands");
  }

  public async handleCommand(
    command: IpcCommand<any>,
    _context: IpcContext
  ): Promise<void> {
    switch (command.method) {
      case MONITOR_START_COMMAND:
        this.clipboardManager.startMonitoring(command.params.duration || 5);
        break;
      case MONITOR_STOP_COMMAND:
        this.clipboardManager.stopMonitoring();
        break;
      case VECTORIZE_GUIDANCE_COMMAND:
        await this.handleVectorize(command.params.id, command.params.content);
        break;
      case VIEW_CONTENT_COMMAND:
        await this.handleViewContent(command.params.content);
        break;
      default:
        throw new Error(
          `Method ${command.method} not supported by ClipboardHandler`
        );
    }
  }

  private async handleVectorize(id: string, content: string) {
      try {
          const guidanceId = await this.indexingService.indexGuidance(content);
          vscode.window.showInformationMessage("Guidance successfully vectorized!");
      } catch (e) {
          vscode.window.showErrorMessage(`Failed to vectorize guidance: ${e}`);
      }
  }

  private async handleViewContent(content: string) {
      const doc = await vscode.workspace.openTextDocument({ content, language: 'text' });
      await vscode.window.showTextDocument(doc);
  }
}
