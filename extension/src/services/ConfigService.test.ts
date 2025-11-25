import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
import { vscode } from '../test/mocks/vscode-api.js';

vi.mock('vscode', () => vscode);

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      extensionUri: { fsPath: '/test/extension' },
      subscriptions: []
    };
    configService = new ConfigService(mockContext);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('should load valid configuration from workspace folder', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file exists and read operations
      vscode.workspace.fs.stat.mockResolvedValueOnce({});
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify(mockConfig))
      );

      const result = await configService.loadConfig(mockFolder);

      expect(result).toEqual({
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      });

      expect(vscode.Uri.joinPath).toHaveBeenCalledWith(
        mockFolder.uri,
        '.qdrant',
        'configuration.json'
      );
      expect(vscode.workspace.fs.stat).toHaveBeenCalled();
      expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
    });

    it('should return null for missing configuration file', async () => {
      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file not found
      vscode.workspace.fs.stat.mockRejectedValueOnce(new Error('File not found'));

      const result = await configService.loadConfig(mockFolder);

      expect(result).toBeNull();
    });

    it('should return null for invalid configuration structure', async () => {
      const mockInvalidConfig = {
        invalid_field: 'test'
      };

      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file exists and read operations
      vscode.workspace.fs.stat.mockResolvedValueOnce({});
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify(mockInvalidConfig))
      );

      const result = await configService.loadConfig(mockFolder);

      expect(result).toBeNull();
    });

    it('should remove trailing slashes from URLs', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333/' },
        ollama_config: { base_url: 'http://localhost:11434/', model: 'nomic-embed-text' }
      };

      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file exists and read operations
      vscode.workspace.fs.stat.mockResolvedValueOnce({});
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify(mockConfig))
      );

      const result = await configService.loadConfig(mockFolder);

      expect(result?.qdrant_config.url).toBe('http://localhost:6333');
      expect(result?.ollama_config.base_url).toBe('http://localhost:11434');
    });

    it('should handle JSON parse errors gracefully', async () => {
      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file exists but contains invalid JSON
      vscode.workspace.fs.stat.mockResolvedValueOnce({});
      vscode.workspace.fs.readFile.mockResolvedValueOnce(
        new TextEncoder().encode('invalid json content')
      );

      const result = await configService.loadConfig(mockFolder);

      expect(result).toBeNull();
    });

    it('should handle UTF-8 decoding errors gracefully', async () => {
      const mockFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;

      // Mock file exists but contains invalid UTF-8
      vscode.workspace.fs.stat.mockResolvedValueOnce({});
      vscode.workspace.fs.readFile.mockRejectedValueOnce(new Error('Decoding failed'));

      const result = await configService.loadConfig(mockFolder);

      expect(result).toBeNull();
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should return true for valid connections', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      // Mock successful API calls
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true }) // Ollama
        .mockResolvedValueOnce({ ok: true }); // Qdrant

      const result = await configService.validateConnection(mockConfig);

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:6333/collections');
    });

    it('should return false for failed Ollama connection', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      // Mock failed Ollama call
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false }); // Ollama fails

      const result = await configService.validateConnection(mockConfig);

      expect(result).toBe(false);
    });

    it('should handle Qdrant authentication errors gracefully', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      // Mock successful Ollama but Qdrant returns auth error
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true }) // Ollama succeeds
        .mockResolvedValueOnce({ ok: false, status: 401 }); // Qdrant auth error

      const result = await configService.validateConnection(mockConfig);

      expect(result).toBe(true); // Should still return true for auth errors
    });

    it('should return false for Qdrant connection failures beyond auth', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      // Mock successful Ollama but Qdrant returns server error
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true }) // Ollama succeeds
        .mockResolvedValueOnce({ ok: false, status: 500 }); // Qdrant server error

      const result = await configService.validateConnection(mockConfig);

      expect(result).toBe(false);
    });

    it('should handle fetch exceptions gracefully', async () => {
      const mockConfig: QdrantOllamaConfig = {
        index_info: { name: 'test-index' },
        qdrant_config: { url: 'http://localhost:6333' },
        ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
      };

      // Mock fetch exception
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await configService.validateConnection(mockConfig);

      expect(result).toBe(false);
    });
  });
});