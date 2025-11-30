import { minimatch } from "minimatch";
import * as vscode from "vscode";
import { AnalyticsService } from "../../services/AnalyticsService.js";
import { ConfigService } from "../../services/ConfigService.js";
import { IndexingService } from "../../services/IndexingService.js";
import { WorkspaceManager } from "../../services/WorkspaceManager.js";
import { IpcContext, IRequestHandler } from "../ipc/IpcRouter.js";
import {
  FileSnippetResult,
  GET_SEARCH_SETTINGS_METHOD,
  GetSearchSettingsResponse,
  IpcCommand,
  IpcRequest,
  IpcResponse,
  SEARCH_METHOD,
  SearchRequestParams,
  UPDATE_SEARCH_SETTINGS_METHOD,
  UpdateSearchSettingsParams,
} from "../protocol.js";

export class SearchHandler implements IRequestHandler {
  constructor(
    private indexingService: IndexingService,
    private workspaceManager: WorkspaceManager,
    private configService: ConfigService,
    private analyticsService: AnalyticsService
  ) {}

  public canHandle(method: string): boolean {
    return [
      SEARCH_METHOD,
      GET_SEARCH_SETTINGS_METHOD,
      UPDATE_SEARCH_SETTINGS_METHOD,
    ].includes(method);
  }

  public async handleCommand(
    _command: IpcCommand<any>,
    _context: IpcContext
  ): Promise<void> {
    // Search currently has no fire-and-forget commands
  }

  public async handleRequest(
    request: IpcRequest<any>,
    context: IpcContext
  ): Promise<IpcResponse<any>> {
    switch (request.method) {
      case SEARCH_METHOD:
        return this.executeSearch(
          request as IpcRequest<SearchRequestParams>,
          context
        );
      case GET_SEARCH_SETTINGS_METHOD:
        return this.getSearchSettings(request);
      case UPDATE_SEARCH_SETTINGS_METHOD:
        return this.updateSearchSettings(
          request as IpcRequest<UpdateSearchSettingsParams>
        );
      default:
        throw new Error(
          `Method ${request.method} not supported by SearchHandler`
        );
    }
  }

  private async executeSearch(
    request: IpcRequest<SearchRequestParams>,
    context: IpcContext
  ): Promise<IpcResponse<any>> {
    const { query, limit, globFilter } = request.params;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error("Invalid search query");
    }

    // 1. Ensure Initialization
    const folder = this.workspaceManager.getActiveWorkspaceFolder();
    if (!folder) throw new Error("No workspace folder found");

    const initSuccess = await this.indexingService.initializeForSearch(folder);
    if (!initSuccess) {
      throw new Error("Indexing service failed to initialize.");
    }

    // 2. Perform Search
    context.log(`Executing search for: "${query}"`, "INFO");
    const rawResults = await this.indexingService.search(query.trim(), {
      limit,
    });

    // 3. Transform & Filter Results
    let results: FileSnippetResult[] = rawResults.map((item) => {
      const workspacePath = folder.uri.fsPath;
      const fullPath = item.payload.filePath.startsWith("/")
        ? item.payload.filePath
        : `${workspacePath}/${item.payload.filePath}`;

      return {
        uri: vscode.Uri.file(fullPath).toString(),
        filePath: item.payload.filePath,
        snippet: item.payload.content,
        lineStart: item.payload.lineStart,
        lineEnd: item.payload.lineEnd,
        score: item.score,
      };
    });

    if (globFilter?.trim()) {
      const patterns = globFilter
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      results = results.filter((result) =>
        patterns.some((pattern) => minimatch(result.filePath, pattern))
      );
    }

    // 4. Analytics
    this.analyticsService.trackSearch({
      queryLength: query.length,
      resultsCount: results.length,
    });

    return {
      kind: "response",
      responseId: request.id,
      id: crypto.randomUUID(),
      scope: request.scope,
      timestamp: Date.now(),
      data: { results },
    };
  }

  private async getSearchSettings(
    request: IpcRequest<any>
  ): Promise<IpcResponse<GetSearchSettingsResponse>> {
    const config = this.configService.config;
    return {
      kind: "response",
      responseId: request.id,
      id: crypto.randomUUID(),
      scope: request.scope,
      timestamp: Date.now(),
      data: {
        limit: config.search.limit,
        threshold: config.search.threshold,
        includeQueryInCopy: config.search.includeQueryInCopy ?? false,
      },
    };
  }

  private async updateSearchSettings(
    request: IpcRequest<UpdateSearchSettingsParams>
  ): Promise<IpcResponse<{ success: boolean }>> {
    const { limit, threshold, includeQueryInCopy } = request.params;

    if (limit !== undefined) {
      await this.configService.updateVSCodeSetting("searchLimit", limit, true);
    }
    if (threshold !== undefined) {
      await this.configService.updateVSCodeSetting(
        "searchThreshold",
        threshold,
        true
      );
    }
    if (includeQueryInCopy !== undefined) {
      await this.configService.updateVSCodeSetting(
        "includeQueryInCopy",
        includeQueryInCopy,
        true
      );
    }

    return {
      kind: "response",
      responseId: request.id,
      id: crypto.randomUUID(),
      scope: request.scope,
      timestamp: Date.now(),
      data: { success: true },
    };
  }
}
