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
    const { query, limit, globFilter, includeGuidance } = request.params;

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

    // 2. Perform Primary Search (Files)
    // Filter out guidance items by default unless strictly asked for (or just separate them)
    // The requirement is: "first undertake a search with filters for files, then undertake a second search using the filter for the guidance"
    // Assuming 'type' field is available in payload. If 'type' is missing, assume it's a file (legacy items).
    context.log(`Executing file search for: "${query}"`, "INFO");

    // Qdrant filter for files (type != 'guidance' OR type is null)
    const fileFilter = {
        must_not: [
            { key: "type", match: { value: "guidance" } }
        ]
    };

    const rawFileResults = await this.indexingService.search(query.trim(), {
      limit,
      filter: fileFilter
    });

    let finalRawResults = [...rawFileResults];

    // 3. Perform Secondary Search (Guidance) if requested
    if (includeGuidance) {
        const guidanceLimit = this.configService.config.search.guidanceLimit || 2;
        const guidanceThreshold = this.configService.config.search.guidanceThreshold || 0.6;

        context.log(`Executing guidance search for: "${query}" (Limit: ${guidanceLimit})`, "INFO");

        const guidanceFilter = {
            must: [
                { key: "type", match: { value: "guidance" } }
            ]
        };

        const rawGuidanceResults = await this.indexingService.search(query.trim(), {
            limit: guidanceLimit,
            filter: guidanceFilter
        });

        // Filter by specific guidance threshold if needed, or rely on global threshold
        const validGuidance = rawGuidanceResults.filter(r => r.score >= guidanceThreshold);

        // Append to results
        finalRawResults = [...finalRawResults, ...validGuidance];
    }

    // 4. Transform & Filter Results
    let results: FileSnippetResult[] = finalRawResults.map((item) => {
      const isGuidance = item.payload.type === 'guidance';

      let uriString: string;
      if (isGuidance) {
          uriString = 'guidance:clipboard';
      } else {
        const workspacePath = folder.uri.fsPath;
        const fullPath = item.payload.filePath.startsWith("/")
            ? item.payload.filePath
            : `${workspacePath}/${item.payload.filePath}`;
        uriString = vscode.Uri.file(fullPath).toString();
      }

      return {
        uri: uriString,
        filePath: item.payload.filePath,
        snippet: item.payload.content,
        lineStart: item.payload.lineStart,
        lineEnd: item.payload.lineEnd,
        score: item.score,
        type: item.payload.type || 'file'
      };
    });

    if (globFilter?.trim()) {
      const patterns = globFilter
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // Only filter file results, keep guidance results
      results = results.filter((result) =>
        result.type === 'guidance' || patterns.some((pattern) => minimatch(result.filePath, pattern))
      );
    }

    // 5. Analytics
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
    const { limit, threshold, includeQueryInCopy, guidanceSearchLimit, guidanceSearchThreshold } = request.params;

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
    if (guidanceSearchLimit !== undefined) {
      await this.configService.updateVSCodeSetting(
        "guidanceSearchLimit",
        guidanceSearchLimit,
        true
      );
    }
    if (guidanceSearchThreshold !== undefined) {
      await this.configService.updateVSCodeSetting(
        "guidanceSearchThreshold",
        guidanceSearchThreshold,
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
