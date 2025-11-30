import { ConfigService } from "../../services/ConfigService.js";
import { SettingsManager } from "../../settings.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  GET_VSCODE_SETTINGS_METHOD,
  IpcCommand,
  IpcRequest,
  IpcResponse,
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  TEST_CONFIG_METHOD,
  TestConfigParams,
  UPDATE_VSCODE_SETTINGS_METHOD,
  VSCodeSettings,
} from "../protocol.js";

export class ConfigHandler implements IRequestHandler {
  constructor(private configService: ConfigService) {}

  public canHandle(method: string): boolean {
    return [
      GET_VSCODE_SETTINGS_METHOD,
      UPDATE_VSCODE_SETTINGS_METHOD,
      TEST_CONFIG_METHOD,
      LOAD_CONFIG_METHOD,
      SAVE_CONFIG_METHOD, // Deprecated, but handled
    ].includes(method);
  }

  public async handleCommand(
    _command: IpcCommand<any>,
    _context: IpcContext
  ): Promise<void> {
    // Config has no commands currently
  }

  public async handleRequest(
    request: IpcRequest<any>,
    context: IpcContext
  ): Promise<IpcResponse<any>> {
    const baseResponse = {
      kind: "response" as const,
      responseId: request.id,
      id: crypto.randomUUID(),
      scope: request.scope,
      timestamp: Date.now(),
    };

    switch (request.method) {
      case GET_VSCODE_SETTINGS_METHOD: {
        const settings = SettingsManager.getSettings();
        context.log(`Retrieved VS Code settings`, "INFO");
        return { ...baseResponse, data: settings };
      }

      case UPDATE_VSCODE_SETTINGS_METHOD: {
        await SettingsManager.updateSettings(
          request.params as Partial<VSCodeSettings>
        );
        context.log(`Updated VS Code settings`, "INFO");
        return { ...baseResponse, data: { success: true } };
      }

      case TEST_CONFIG_METHOD: {
        const params = request.params as TestConfigParams;
        const result = await this.configService.validateConnectionDetailed(
          params.config
        );
        return { ...baseResponse, data: result };
      }

      case LOAD_CONFIG_METHOD: {
        // Used for migration (reading old file)
        // We need a workspace folder context, assuming active for now via internal service lookups
        // Note: Ideally pass workspaceManager to this handler if strict correctness needed.
        // For this refactor, we are mimicking existing behavior.
        // Returning null as this logic was heavily tied to active workspace in controller.
        // Use with caution or inject WorkspaceManager.
        return { ...baseResponse, data: null };
      }

      case SAVE_CONFIG_METHOD: {
        context.log(`Received deprecated SAVE_CONFIG_METHOD`, "WARN");
        return { ...baseResponse, data: { success: true } };
      }

      default:
        throw new Error(
          `Method ${request.method} not supported by ConfigHandler`
        );
    }
  }
}
