import { vi, test, expect, beforeEach, afterEach, Mock } from 'vitest';
import { ConfigService } from './ConfigService.js';
import { ConfigPath, DefaultConfiguration } from '../config/Configuration.js';
import * as vscode from 'vscode'; // Import vscode here for FileType

// Mock React store to prevent issues during import
vi.mock('svelte/store', () => ({
  writable: vi.fn(() => ({
    subscribe: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
  })),
  readable: vi.fn(() => ({
    subscribe: vi.fn()
  })),
  derived: vi.fn(() => ({
    subscribe: vi.fn()
  }))
}));

// Mock VS Code API globally for the test suite
vi.mock('vscode', () => {
    const mockOnDidChangeConfiguration = vi.fn();
    const mockGet = vi.fn((key?: string) => {
        // Default mock values
        if (key === 'qdrant.search.trace') return false;
        if (key === 'qdrant.indexing.enabled') return true;
        if (key === 'qdrant.indexing.maxFiles') return 500;
        if (key === 'qdrant.search.limit') return 10;
        return 'default';
    });

    return {
        workspace: {
            getConfiguration: () => ({ get: mockGet }),
            // Mock change event registration
            onDidChangeConfiguration: mockOnDidChangeConfiguration, // This should be vi.fn() directly
            fs: {
                stat: vi.fn(),
                readFile: vi.fn(),
                createDirectory: vi.fn(),
                writeFile: vi.fn()
            },
            asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
                if (typeof pathOrUri === 'string') {
                    return pathOrUri.replace('/test/workspace/', '');
                }
                return pathOrUri.fsPath.replace('/test/workspace/', '');
            })
        },
        Uri: {
            joinPath: vi.fn((base: any, ...segments: string[]) => ({
                fsPath: [base.fsPath, ...segments].join('/'),
                scheme: 'file',
                path: [base.fsPath, ...segments].join('/'),
                query: '',
                fragment: '',
                with: vi.fn(),
                toString: vi.fn(() => [base.fsPath, ...segments].join('/'))
            }))
        },
        Disposable: class Disposable { dispose = vi.fn(); },
        ConfigurationChangeEvent: class {},
        // Add FileType to the mock if it's used in the test file
        FileType: {
            Unknown: 0,
            File: 1,
            Directory: 2,
            SymbolicLink: 64
        }
    };
});

// Mock fetch for connection validation
global.fetch = vi.fn();

describe('ConfigService', () => {
    let configService: ConfigService;

    beforeEach(() => {
        vi.clearAllMocks();
        try {
            configService = new ConfigService();
        } catch (e) {
            console.error('Error instantiating ConfigService:', e);
            throw e;
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('ConfigService registers a configuration change handler upon instantiation', () => {
        // Assert that the necessary VS Code API was called to subscribe to changes
        expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalledOnce();
    });

    test('ConfigService loads derived property correctly', () => {
        const service = new ConfigService();
        // Assuming a mocked structure where indexing.enabled is derived from a setting
        expect(service.config.indexing.enabled).toBe(true);
    });

    test('ConfigService loads default configuration when VS Code config is invalid', () => {
        // Mock invalid configuration
        vi.mocked(vscode.workspace.getConfiguration()).get = vi.fn(() => undefined); // Directly set the mock
        
        const service = new ConfigService();
        
        expect(service.config).toEqual(DefaultConfiguration);
    });

    test('ConfigService.get returns correct nested values', () => {
        expect(configService.get('indexing.enabled')).toBe(true);
        expect(configService.get('indexing.maxFiles')).toBe(500);
        expect(configService.get('search.limit')).toBe(10);
        expect(configService.get('general.trace')).toBe(false);
    });

    test('ConfigService.get returns undefined for invalid paths', () => {
        expect(configService.get('invalid.path')).toBeUndefined();
        expect(configService.get('indexing.invalid')).toBeUndefined();
    });

    test('ConfigService.update modifies configuration correctly', () => {
        configService.update('indexing.enabled', false);
        expect(configService.get('indexing.enabled')).toBe(false);

        configService.update('search.limit', 20);
        expect(configService.get('search.limit')).toBe(20);
    });

    test('ConfigService.update creates nested objects if needed', () => {
        configService.update('new.nested.value', 'test');
        expect(configService.get('new.nested.value')).toBe('test');
    });

    test('ConfigService configuration change listeners are notified', () => {
        const listener = vi.fn();
        configService.addConfigurationChangeListener(listener);

        configService.update('indexing.enabled', false);

        expect(listener).toHaveBeenCalledWith({
            section: 'indexing.enabled',
            value: false
        });
    });

    test('ConfigService can remove configuration change listeners', () => {
        const listener = vi.fn();
        configService.addConfigurationChangeListener(listener);
        configService.removeConfigurationChangeListener(listener);

        configService.update('indexing.enabled', false);

        expect(listener).not.toHaveBeenCalled();
    });

    test('ConfigService handles listener errors gracefully', () => {
        const faultyListener = vi.fn(() => {
            throw new Error('Listener error');
        });
        const goodListener = vi.fn();

        configService.addConfigurationChangeListener(faultyListener);
        configService.addConfigurationChangeListener(goodListener);

        // Should not throw despite faulty listener
        expect(() => configService.update('indexing.enabled', false)).not.toThrow();

        expect(faultyListener).toHaveBeenCalled();
        expect(goodListener).toHaveBeenCalled();
    });

    test('ConfigService.loadQdrantConfig loads valid configuration', async () => {
        const mockConfig = {
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
        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockConfig))
        );

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toEqual({
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'http://localhost:6333' }, // Trailing slash removed
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' } // Trailing slash removed
        });

        expect(configService.qdrantConfig).toEqual(result);
    });

    test('ConfigService.loadQdrantConfig returns null for missing file', async () => {
        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        // Mock file not found
        (vi.mocked(vscode.workspace.fs.stat)).mockRejectedValueOnce(new Error('File not found'));

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toBeNull();
    });

    test('ConfigService.loadQdrantConfig returns null for invalid structure', async () => {
        const mockInvalidConfig = {
            invalid_field: 'test'
        };

        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        // Mock file exists and read operations
        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockInvalidConfig))
        );

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toBeNull();
    });

    test('ConfigService.validateConnection returns true for valid connections', async () => {
        const mockConfig = {
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

    test('ConfigService.validateConnection returns false for failed Ollama connection', async () => {
        const mockConfig = {
            qdrant_config: { url: 'http://localhost:6333' },
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
        };

        // Mock failed Ollama call
        (global.fetch as any).mockResolvedValueOnce({ ok: false });

        const result = await configService.validateConnection(mockConfig);

        expect(result).toBe(false);
    });

    test('ConfigService.validateConnection handles Qdrant auth errors gracefully', async () => {
        const mockConfig = {
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

    test('ConfigService.dispose cleans up resources', () => {
        // Mock onDidChangeConfiguration behavior for this specific test
        const mockOnDidChangeConfigurationForTest = vi.fn().mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(mockOnDidChangeConfigurationForTest);

        const service = new ConfigService();
        service.dispose();

        expect(mockOnDidChangeConfigurationForTest).toHaveBeenCalledOnce();
        expect(service['_listeners']).toEqual([]);
    });

    test('ConfigService returns immutable config copies', () => {
        const config1 = configService.config;
        const config2 = configService.config;

        expect(config1).not.toBe(config2); // Different object references
        expect(config1).toEqual(config2); // Same content

        // Modifying returned config should not affect service
        (config1 as any).indexing.enabled = false;
        expect(configService.config.indexing.enabled).toBe(true);
    });

    test('ConfigService returns immutable qdrantConfig copies', async () => {
        const mockConfig = {
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'http://localhost:6333' },
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
        };

        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockConfig))
        );

        await configService.loadQdrantConfig(mockFolder);

        const qdrantConfig1 = configService.qdrantConfig;
        const qdrantConfig2 = configService.qdrantConfig;

        expect(qdrantConfig1).not.toBe(qdrantConfig2); // Different object references
        expect(qdrantConfig1).toEqual(qdrantConfig2); // Same content

        // Modifying returned config should not affect service
        if (qdrantConfig1) {
            (qdrantConfig1 as any).qdrant_config.url = 'modified';
        }
        expect(configService.qdrantConfig?.qdrant_config.url).toBe('http://localhost:6333');
    });

    test('ConfigService.loadQdrantConfig adds http:// protocol to URLs missing protocol', async () => {
        const mockConfig = {
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'localhost:6333/' }, // Missing protocol
            ollama_config: { base_url: 'localhost:11434/', model: 'nomic-embed-text' } // Missing protocol
        };

        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        // Mock file exists and read operations
        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockConfig))
        );

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toEqual({
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'http://localhost:6333' }, // Protocol added, trailing slash removed
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' } // Protocol added, trailing slash removed
        });

        expect(configService.qdrantConfig).toEqual(result);
    });

    test('ConfigService.loadQdrantConfig handles URLs with leading slashes correctly', async () => {
        const mockConfig = {
            index_info: { name: 'test-index' },
            qdrant_config: { url: '//localhost:6333/' }, // Leading slashes
            ollama_config: { base_url: '///localhost:11434/', model: 'nomic-embed-text' } // Multiple leading slashes
        };

        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        // Mock file exists and read operations
        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockConfig))
        );

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toEqual({
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'http://localhost:6333' }, // Protocol added, leading slashes removed, trailing slash removed
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' } // Protocol added, leading slashes removed, trailing slash removed
        });

        expect(configService.qdrantConfig).toEqual(result);
    });

    test('ConfigService.loadQdrantConfig preserves existing https protocol', async () => {
        const mockConfig = {
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'https://qdrant.example.com/' }, // HTTPS protocol
            ollama_config: { base_url: 'https://ollama.example.com/', model: 'nomic-embed-text' } // HTTPS protocol
        };

        const mockFolder = {
            uri: { fsPath: '/test/workspace' },
            name: 'test-workspace',
            index: 0
        } as any;

        // Mock file exists and read operations
        (vi.mocked(vscode.workspace.fs.stat)).mockResolvedValueOnce({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: 1 });
        (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify(mockConfig))
        );

        const result = await configService.loadQdrantConfig(mockFolder);

        expect(result).toEqual({
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'https://qdrant.example.com' }, // HTTPS protocol preserved, trailing slash removed
            ollama_config: { base_url: 'https://ollama.example.com', model: 'nomic-embed-text' } // HTTPS protocol preserved, trailing slash removed
        });

        expect(configService.qdrantConfig).toEqual(result);
    });
});