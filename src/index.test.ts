import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticWatcher } from './index.js';
import { AnalyticsService } from './analytics.js';

// --- Mocks ---

// Mock fs/promises
vi.mock('fs/promises', async () => {
  return {
    default: {
      readFile: vi.fn(),
      stat: vi.fn(),
      access: vi.fn(),
      readdir: vi.fn(),
    }
  };
});

// Mock Chokidar
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
    }),
  },
}));

// Mock Better-SQLite3
const mockPrepare = vi.fn();
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      prepare: mockPrepare,
    })),
  };
});

// Mock Qdrant
const mockQdrantUpsert = vi.fn();
const mockQdrantSearch = vi.fn();
const mockQdrantGetCollections = vi.fn();
const mockQdrantCreateCollection = vi.fn();
const mockQdrantDelete = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: mockQdrantGetCollections,
    createCollection: mockQdrantCreateCollection,
    upsert: mockQdrantUpsert,
    search: mockQdrantSearch,
    delete: mockQdrantDelete,
  })),
}));

// Mock Ollama
vi.mock('ollama', () => ({
  default: {
    embeddings: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
  },
}));

// Mock Web-Tree-Sitter
vi.mock('web-tree-sitter', () => ({
  default: {
    init: vi.fn(),
    Language: {
      load: vi.fn().mockResolvedValue({
        query: vi.fn().mockReturnValue({
          captures: vi.fn().mockReturnValue([]), // Return empty captures by default
        }),
      }),
    },
  },
}));


import fs from 'fs/promises';

describe('SemanticWatcher', () => {
  let watcher: SemanticWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default SQLite mocks for every test
    mockPrepare.mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
    });

    // Create mock AnalyticsService
    const mockAnalyticsService = {
      trackEvent: vi.fn(),
      trackToolUse: vi.fn(),
      trackFileIndexed: vi.fn(),
      trackSearchPerformed: vi.fn(),
      trackConnection: vi.fn(),
      trackError: vi.fn(),
      dispose: vi.fn()
    } as any;

    watcher = new SemanticWatcher(mockAnalyticsService);
  });

  describe('Initialization', () => {
    it('should initialize Qdrant collection if not exists', async () => {
      // Mock Qdrant returning empty collections
      mockQdrantGetCollections.mockResolvedValue({ collections: [] });

      await watcher.init();

      expect(mockQdrantCreateCollection).toHaveBeenCalled();
    });

    it('should NOT create Qdrant collection if it exists', async () => {
      // Mock Qdrant returning existing collection
      mockQdrantGetCollections.mockResolvedValue({ 
        collections: [{ name: 'codebase_context' }] 
      });

      await watcher.init();

      expect(mockQdrantCreateCollection).not.toHaveBeenCalled();
    });
  });

  describe('File Handling', () => {
    it('should skip large files', async () => {
      // Mock file stat to be large (2MB)
      vi.mocked(fs.stat).mockResolvedValue({ size: 2 * 1024 * 1024 } as any);
      
      await watcher.handleFileChange('large_file.ts');

      // Should not read file content
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should process new files', async () => {
      // Mock file system
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue('function test() {}');
      
      // Mock DB to return null (file not indexed yet)
      mockPrepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn().mockReturnValue(null), 
      });

      await watcher.handleFileChange('new_file.ts');

      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('new_file.ts'), 'utf-8');
      expect(mockQdrantUpsert).toHaveBeenCalled();
    });

    it('should skip unchanged files (Deduplication)', async () => {
      const content = 'function test() {}';
      // Mock file system
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      // Calculate what the hash would be
      const crypto = await import('crypto');
      const hash = crypto.createHash('md5').update(content).digest('hex');

      // Mock DB to return the SAME hash
      mockPrepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn().mockReturnValue({ content_hash: hash }), 
      });

      await watcher.handleFileChange('existing_file.ts');

      // Should read file to calc hash, but NOT upsert to Qdrant
      expect(fs.readFile).toHaveBeenCalled();
      expect(mockQdrantUpsert).not.toHaveBeenCalled();
    });
  });
  
  describe('Search', () => {
    it('should return formatted results', async () => {
      mockQdrantSearch.mockResolvedValue([
        {
          score: 0.9,
          payload: {
            filePath: 'test.ts',
            startLine: 1,
            endLine: 5,
            content: 'function test() {}'
          }
        }
      ]);

      const result = await watcher.search('test query');
      
      expect(result).toContain('Path: test.ts');
      expect(result).toContain('Score: 0.9000');
    });
  });
});