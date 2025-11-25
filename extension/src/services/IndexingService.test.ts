import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexingService } from './IndexingService.js';
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { vscode } from '../test/mocks/vscode-api.js';
import { QdrantClient } from '@qdrant/js-client-rest';

// Mock Qdrant client
vi.mock('@qdrant/js-client-rest');

// Mock shared code splitter
vi.mock('shared/code-splitter.js', () => ({
  CodeSplitter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    split: vi.fn().mockReturnValue([
      {
        id: 'test-chunk-1',
        filePath: 'test.ts',
        content: 'function test() {}',
        lineStart: 1,
        lineEnd: 5
      }
    ])
  }))
}));

vi.mock('vscode', () => vscode);

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let mockConfigService: ConfigService;
  let mockContext: any;
  let mockQdrantClient: any;
  let mockFolder: any;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: '/test/extension' },
      subscriptions: []
    };

    mockConfigService = new ConfigService(mockContext);
    indexingService = new IndexingService(mockConfigService, mockContext);

    // Mock Qdrant client
    mockQdrantClient = {
      getCollections: vi.fn(),
      createCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(),
      delete: vi.fn()
    };

    (QdrantClient as any).mockImplementation(() => mockQdrantClient);

    mockFolder = {
      uri: { fsPath: '/test/workspace' },
      name: 'test-workspace',
      index: 0
    };

    // Global fetch mock
    global.fetch = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('indexWorkspace', () => {
    const mockConfig: QdrantOllamaConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
    };

    it('should index workspace successfully', async () => {
      // Mock configuration loading and validation
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      // Mock Qdrant operations
      mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      // Mock file discovery
      vscode.workspace.findFiles.mockResolvedValueOnce([
        { fsPath: '/test/workspace/test.ts' }
      ]);

      // Mock file reading
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode('function test() {}')
      );

      // Mock embedding generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      await indexingService.indexWorkspace(mockFolder);

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test-index', {
        vectors: { size: 768, distance: 'Cosine' }
      });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Indexed 1 files successfully')
      );
    });

    it('should show warning when indexing is already in progress', async () => {
      // Start first indexing operation
      const firstIndexingPromise = indexingService.indexWorkspace(mockFolder);

      // Try to start second indexing operation
      await indexingService.indexWorkspace(mockFolder);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Indexing is already in progress.');

      // Wait for first operation to complete
      await firstIndexingPromise;
    });

    it('should show error for missing configuration', async () => {
      // Mock missing configuration
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(null);

      await indexingService.indexWorkspace(mockFolder);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('No valid configuration found')
      );
    });

    it('should show error for failed connection validation', async () => {
      // Mock configuration loading but failed connection
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(false);

      await indexingService.indexWorkspace(mockFolder);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Could not connect to Qdrant or Ollama')
      );
    });

    it('should handle file indexing errors gracefully', async () => {
      // Mock configuration loading and validation
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      // Mock Qdrant operations
      mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      // Mock file discovery
      vscode.workspace.findFiles.mockResolvedValueOnce([
        { fsPath: '/test/workspace/test.ts' }
      ]);

      // Mock file read error
      vscode.workspace.fs.readFile.mockRejectedValueOnce(new Error('File read error'));

      await indexingService.indexWorkspace(mockFolder);

      // Should still complete without crashing
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexed 0 files successfully');
    });

    it('should handle embedding generation failures gracefully', async () => {
      // Mock configuration loading and validation
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      // Mock Qdrant operations
      mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      // Mock file discovery and reading
      vscode.workspace.findFiles.mockResolvedValueOnce([
        { fsPath: '/test/workspace/test.ts' }
      ]);
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode('function test() {}')
      );

      // Mock embedding generation failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      });

      await indexingService.indexWorkspace(mockFolder);

      // Should still complete without crashing, but 0 files indexed
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexed 0 files successfully');
    });

    it('should limit file indexing to 500 files', async () => {
      // Mock configuration loading and validation
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      // Mock Qdrant operations
      mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      // Mock many files
      const manyFiles = Array.from({ length: 600 }, (_, i) => ({ fsPath: `/test/workspace/file${i}.ts` }));
      vscode.workspace.findFiles.mockResolvedValueOnce(manyFiles);

      // Mock file reading for the first 500 files
      vscode.workspace.fs.readFile.mockResolvedValue(
        new TextEncoder().encode('function test() {}')
      );

      // Mock embedding generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      await indexingService.indexWorkspace(mockFolder);

      // Should have limited to 500 files
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        500
      );
    });
  });

  describe('search', () => {
    const mockConfig: QdrantOllamaConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
    };

    beforeEach(async () => {
      // Set up service with config for search tests
      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(mockConfig);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      // Mock indexing setup to initialize the service
      mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValueOnce({});

      await indexingService.indexWorkspace(mockFolder);
    });

    it('should return search results successfully', async () => {
      // Mock embedding generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      // Mock search results
      mockQdrantClient.search.mockResolvedValueOnce({
        points: [{
          id: 'test-id',
          score: 0.9,
          payload: {
            filePath: 'test.ts',
            content: 'function test() {}',
            lineStart: 1,
            lineEnd: 5
          }
        }]
      });

      const results = await indexingService.search('test query');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'test-id',
        score: 0.9,
        payload: {
          filePath: 'test.ts',
          content: 'function test() {}',
          lineStart: 1,
          lineEnd: 5
        }
      });
    });

    it('should return empty array when service not initialized', async () => {
      // Create new service without indexing
      const freshService = new IndexingService(mockConfigService, mockContext);
      const results = await freshService.search('test query');

      expect(results).toEqual([]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Indexing service is not initialized. Cannot perform search.'
      );
    });

    it('should return empty array for failed embedding generation', async () => {
      // Mock embedding generation failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      });

      const results = await indexingService.search('test query');

      expect(results).toEqual([]);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Could not generate embedding for search query.'
      );
    });

    it('should handle search with hits instead of points', async () => {
      // Mock embedding generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      // Mock search results with hits (alternative response format)
      mockQdrantClient.search.mockResolvedValueOnce({
        hits: [{
          id: 'test-id',
          score: 0.9,
          payload: {
            filePath: 'test.ts',
            content: 'function test() {}',
            lineStart: 1,
            lineEnd: 5
          }
        }]
      });

      const results = await indexingService.search('test query');

      expect(results).toHaveLength(1);
      expect(results[0].payload.content).toBe('function test() {}');
    });

    it('should handle search errors gracefully', async () => {
      // Mock embedding generation success
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      // Mock search error
      mockQdrantClient.search.mockRejectedValueOnce(new Error('Search failed'));

      const results = await indexingService.search('test query');

      expect(results).toEqual([]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Search failed:')
      );
    });

    it('should use default collection name when not specified', async () => {
      // Create service with config without index_info
      const configWithoutIndex = {
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      vi.spyOn(mockConfigService, 'loadConfig').mockResolvedValueOnce(configWithoutIndex);
      vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);

      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValue({});

      await indexingService.indexWorkspace(mockFolder);

      // Mock embedding generation and search
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      mockQdrantClient.search.mockResolvedValueOnce({ points: [] });

      await indexingService.search('test query');

      expect(mockQdrantClient.search).toHaveBeenCalledWith('codebase', {
        vector: [0.1, 0.2, 0.3],
        limit: 10
      });
    });
  });
});