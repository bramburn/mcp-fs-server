import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SearchHandler } from './SearchHandler.js';
import { IndexingService } from '../../services/IndexingService.js';
import { WorkspaceManager } from '../../services/WorkspaceManager.js';
import { ConfigService } from '../../services/ConfigService.js';
import { AnalyticsService } from '../../services/AnalyticsService.js';
import { IpcRequest, SEARCH_METHOD, SearchRequestParams } from '../protocol.js';
import { IpcContext } from '../ipc/IpcRouter.js';

// Mock VS Code API
vi.mock("vscode", async () => {
    const actual = await vi.importActual<typeof import("../../test/mocks/vscode-api.js")>("../../test/mocks/vscode-api.js");
    return {
        ...actual,
        default: actual.vscode, // Ensure default export matches
        ...actual.vscode
    };
});
import * as vscode from 'vscode';

// Mock dependencies
const mockIndexingService = {
  initializeForSearch: vi.fn(),
  search: vi.fn(),
} as unknown as IndexingService;

const mockWorkspaceManager = {
  getActiveWorkspaceFolder: vi.fn(),
} as unknown as WorkspaceManager;

const mockConfigService = {
  config: {
    search: {
      limit: 10,
      threshold: 0.7,
      guidanceLimit: 2,
      guidanceThreshold: 0.6,
    }
  }
} as unknown as ConfigService;

const mockAnalyticsService = {
  trackSearch: vi.fn(),
} as unknown as AnalyticsService;

const mockContext: IpcContext = {
    postMessage: vi.fn(),
    log: vi.fn(),
};

describe('SearchHandler', () => {
  let handler: SearchHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SearchHandler(
      mockIndexingService,
      mockWorkspaceManager,
      mockConfigService,
      mockAnalyticsService
    );

    // Default mocks
    (mockWorkspaceManager.getActiveWorkspaceFolder as any).mockReturnValue({
        uri: vscode.Uri.file('/test/workspace')
    });
    (mockIndexingService.initializeForSearch as any).mockResolvedValue(true);
    (mockIndexingService.search as any).mockResolvedValue([
        { payload: { filePath: 'src/file1.ts', content: 'content1', lineStart: 1, lineEnd: 2 }, score: 0.9 },
        { payload: { filePath: 'src/file2.js', content: 'content2', lineStart: 3, lineEnd: 4 }, score: 0.8 },
        { payload: { filePath: 'README.md', content: 'content3', lineStart: 5, lineEnd: 6 }, score: 0.7 },
    ]);
  });

  const createRequest = (params: SearchRequestParams): IpcRequest<SearchRequestParams> => ({
    id: 'req-1',
    scope: 'qdrantIndex',
    timestamp: Date.now(),
    kind: 'request',
    method: SEARCH_METHOD,
    params
  });

  it('performs search without filters', async () => {
    const request = createRequest({ query: 'test' });
    const response = await handler.handleRequest(request, mockContext);

    expect(response.data.results).toHaveLength(3);
    expect(response.data.results.map((r: any) => r.filePath)).toEqual(['src/file1.ts', 'src/file2.js', 'README.md']);
  });

  it('filters results using glob pattern', async () => {
    const request = createRequest({ query: 'test', globFilter: '**/*.ts' });
    const response = await handler.handleRequest(request, mockContext);

    expect(response.data.results).toHaveLength(1);
    expect(response.data.results[0].filePath).toBe('src/file1.ts');
  });

  it('filters results using regex pattern', async () => {
    const request = createRequest({ query: 'test', globFilter: '.*\\.js$', useRegex: true });
    const response = await handler.handleRequest(request, mockContext);

    expect(response.data.results).toHaveLength(1);
    expect(response.data.results[0].filePath).toBe('src/file2.js');
  });

  it('filters results using complex regex pattern', async () => {
    // Match .ts OR .md
    const request = createRequest({ query: 'test', globFilter: '.*\\.(ts|md)$', useRegex: true });
    const response = await handler.handleRequest(request, mockContext);

    expect(response.data.results).toHaveLength(2);
    expect(response.data.results.map((r: any) => r.filePath)).toEqual(['src/file1.ts', 'README.md']);
  });

  it('handles invalid regex gracefully (returns empty for files)', async () => {
    const request = createRequest({ query: 'test', globFilter: '[', useRegex: true });
    const response = await handler.handleRequest(request, mockContext);

    expect(response.data.results).toHaveLength(0);
    expect(mockContext.log).toHaveBeenCalledWith(expect.stringContaining('Invalid regex filter'), 'ERROR');
  });

  it('preserves guidance results regardless of file filter', async () => {
      // Mock search to return guidance as well (though logic separates them, let's assume search returns files,
      // and we mock separate call for guidance if needed, but the handler logic does 2 searches if includeGuidance is true)

      // Setup guidance search mock
      (mockIndexingService.search as any).mockImplementation(async (_query: string, options: any): Promise<any[]> => {
          if (options.filter?.must) {
              // Guidance search
              return [{ payload: { filePath: 'guidance', content: 'tip', type: 'guidance' }, score: 0.9 }];
          } else {
              // File search
               return [
                { payload: { filePath: 'src/file1.ts', content: 'content1' }, score: 0.9 }
            ];
          }
      });

      const request = createRequest({
          query: 'test',
          globFilter: '*.js', // Should filter out file1.ts
          includeGuidance: true
      });

      const response = await handler.handleRequest(request, mockContext);

      const results = response.data.results;
      // Should have 0 files (filtered out) + 1 guidance
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('guidance');
  });

    it('preserves guidance results regardless of regex filter', async () => {
      (mockIndexingService.search as any).mockImplementation(async (_query: string, options: any): Promise<any[]> => {
          if (options.filter?.must) {
              return [{ payload: { filePath: 'guidance', content: 'tip', type: 'guidance' }, score: 0.9 }];
          } else {
               return [
                { payload: { filePath: 'src/file1.ts', content: 'content1' }, score: 0.9 }
            ];
          }
      });

      const request = createRequest({
          query: 'test',
          globFilter: '.*\\.js$', // Should filter out file1.ts
          useRegex: true,
          includeGuidance: true
      });

      const response = await handler.handleRequest(request, mockContext);

      const results = response.data.results;
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('guidance');
  });
});
