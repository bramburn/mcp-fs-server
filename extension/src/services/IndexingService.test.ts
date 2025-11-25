import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { IndexingService } from './IndexingService.js';
import { ConfigService } from './ConfigService.js';
import { QdrantOllamaConfig } from '../webviews/protocol.js';
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

// Mock VS Code API
vi.mock('vscode', () => {
    // FIXES: Define all necessary mocks for ConfigService instantiation
    const mockOnDidChangeConfiguration = vi.fn();
    const mockGet = vi.fn((key?: string) => {
        // Default mock values
        if (key === 'qdrant.search.trace') return false;
        if (key === 'qdrant.indexing.enabled') return true;
        if (key === 'qdrant.indexing.maxFiles') return 500;
        if (key === 'qdrant.search.limit') return 10;
        return 'default';
    });

    // Moved inside the vi.mock factory function
    const MockCancellationTokenSource = class {
        token: { isCancellationRequested: boolean } = { isCancellationRequested: false };
        cancel = vi.fn(() => { this.token.isCancellationRequested = true; }); // Make cancel a mock function
        dispose = vi.fn();
    };

    return {
        workspace: {
            fs: {
                stat: vi.fn(),
                readFile: vi.fn(),
                createDirectory: vi.fn(),
                writeFile: vi.fn()
            },
            findFiles: vi.fn(),
            getConfiguration: () => ({ get: mockGet }),
            asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
                if (typeof pathOrUri === 'string') {
                    return pathOrUri.replace('/test/workspace/', '');
                }
                return pathOrUri.fsPath.replace('/test/workspace/', '');
            }),
            workspaceFolders: [
                {
                    uri: { fsPath: '/test/workspace' },
                    name: 'test-workspace',
                    index: 0
                }
            ],
            // FIX: onDidChangeConfiguration must be inside the workspace object
            onDidChangeConfiguration: mockOnDidChangeConfiguration
        },
        window: {
            activeTextEditor: undefined,
            showInformationMessage: vi.fn(),
            showErrorMessage: vi.fn(),
            showWarningMessage: vi.fn(),
            setStatusBarMessage: vi.fn()
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
            })),
            file: vi.fn((path: string) => ({ // Add mock for Uri.file
                fsPath: path,
                scheme: 'file',
                path: path,
                query: '',
                fragment: '',
                with: vi.fn(),
                toString: vi.fn(() => path)
            }))
        },
        RelativePattern: vi.fn(),
        CancellationTokenSource: MockCancellationTokenSource as any, // Refer to the class here, cast to any
        // FIX: Add necessary classes for ConfigService to instantiate without error
        Disposable: class Disposable { dispose = vi.fn(); },
        ConfigurationChangeEvent: class {},
        FileType: {
            Unknown: 0,
            File: 1,
            Directory: 2,
            SymbolicLink: 64
        }
    };
});

// Mock fetch for API calls
global.fetch = vi.fn();

describe('IndexingService', () => {
    let indexingService: IndexingService;
    let mockConfigService: ConfigService;
    let mockContext: any;
    let mockQdrantClient: any;
    let mockTokenSource: any;

    beforeEach(() => {
        mockContext = {
            extensionUri: { fsPath: '/test/extension' },
            subscriptions: []
        };

        // This line now successfully creates ConfigService due to the mock fix
        mockConfigService = new ConfigService();
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

        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('startIndexing', () => {
        const mockConfig: QdrantOllamaConfig = {
            index_info: { name: 'test-index' },
            qdrant_config: { url: 'http://localhost:6333' },
            ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
        };

        beforeEach(() => {
            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });
        });

        test('should index workspace successfully', async () => {
            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file reading
            (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
                new TextEncoder().encode('function test() {}')
            );

            // Mock embedding generation
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2, 0.3] })
            });

            await indexingService.startIndexing();

            expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test-index', {
                vectors: { size: 768, distance: 'Cosine' }
            });
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Indexed 1 files successfully')
            );
        });

        test('should show warning when indexing is already in progress', async () => {
            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock findFiles to take time
            (vi.mocked(vscode.workspace.findFiles)).mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve([]), 100);
                });
            });

            // Start first indexing operation (don't await it)
            const firstIndexingPromise = indexingService.startIndexing();

            // Give the first operation time to set _isIndexing to true
            await new Promise(resolve => setTimeout(resolve, 10));

            // Try to start second indexing operation (should return immediately with warning)
            await indexingService.startIndexing();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Indexing is already in progress.');

            // Wait for first operation to complete
            await firstIndexingPromise;
        });

        test('should show error for missing configuration', async () => {
            // Mock missing configuration
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(null);

            await indexingService.startIndexing();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('No valid configuration found')
            );
        });

        test('should show error for failed connection validation', async () => {
            // Mock configuration loading but failed connection
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(false);

            await indexingService.startIndexing();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Could not connect to Qdrant or Ollama')
            );
        });

        test('should handle file indexing errors gracefully', async () => {
            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file read error
            (vi.mocked(vscode.workspace.fs.readFile)).mockRejectedValueOnce(new Error('File read error'));

            await indexingService.startIndexing();

            // Should still complete without crashing
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Indexed 0 files successfully')
            );
        });
    });

    describe('stopIndexing', () => {
        test('should cancel indexing when stopIndexing is called', async () => {
            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file reading with delay to allow cancellation
            (vi.mocked(vscode.workspace.fs.readFile)).mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(new TextEncoder().encode('function test() {}')), 50);
                });
            });

            // Start indexing
            const indexingPromise = indexingService.startIndexing();

            // Wait a bit then cancel
            await new Promise(resolve => setTimeout(resolve, 10));
            indexingService.stopIndexing();

            // Should show cancellation message
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexing was cancelled');

            // Wait for indexing to complete
            await indexingPromise;
        });
    });

    describe('Indexing stops gracefully when cancelled (edge case)', () => {
        test('should handle cancellation during file processing', async () => {
            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file reading with delay
            (vi.mocked(vscode.workspace.fs.readFile)).mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(new TextEncoder().encode('function test() {}')), 50);
                });
            });

            // Start indexing and get token source
            const indexingPromise = indexingService.startIndexing();

            // Wait a bit then cancel
            await new Promise(resolve => setTimeout(resolve, 10));
            indexingService.stopIndexing();

            // Should resolve without crashing
            await expect(indexingPromise).resolves.toBeUndefined();

            // Should show cancellation message
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexing was cancelled');
        });

        test('should handle cancellation during embedding generation', async () => {
            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file reading
            (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
                new TextEncoder().encode('function test() {}')
            );

            // Mock embedding generation with delay
            (global.fetch as any).mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve({
                        ok: true,
                        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
                    }), 50);
                });
            });

            // Start indexing
            const indexingPromise = indexingService.startIndexing();

            // Wait a bit then cancel
            await new Promise(resolve => setTimeout(resolve, 10));
            indexingService.stopIndexing();

            // Should resolve without crashing
            await expect(indexingPromise).resolves.toBeUndefined();

            // Should show cancellation message
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Indexing was cancelled');
        });
    });

    describe('progress listeners', () => {
        test('should notify progress listeners during indexing', async () => {
            const progressListener = vi.fn();
            indexingService.addProgressListener(progressListener);

            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([
                vscode.Uri.file('/test/workspace/test.ts')
            ]);

            // Mock file reading
            (vi.mocked(vscode.workspace.fs.readFile)).mockResolvedValueOnce(
                new TextEncoder().encode('function test() {}')
            );

            // Mock embedding generation
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2, 0.3] })
            });

            await indexingService.startIndexing();

            // Should have been called with progress updates
            expect(progressListener).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'starting' })
            );
            expect(progressListener).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'indexing' })
            );
            expect(progressListener).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'completed' })
            );

            indexingService.removeProgressListener(progressListener);
        });

        test('should handle progress listener errors gracefully', async () => {
            const faultyListener = vi.fn(() => {
                throw new Error('Listener error');
            });
            const goodListener = vi.fn();

            indexingService.addProgressListener(faultyListener);
            indexingService.addProgressListener(goodListener);

            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Mock configuration loading and validation
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock Qdrant operations
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            // Mock file discovery
            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([]);

            await indexingService.startIndexing();

            // Both listeners should be called despite error in faulty listener
            expect(faultyListener).toHaveBeenCalled();
            expect(goodListener).toHaveBeenCalled();

            indexingService.removeProgressListener(faultyListener);
            indexingService.removeProgressListener(goodListener);
        });
    });

    describe('search', () => {
        beforeEach(async () => {
            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            // Set up service with config for search tests
            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            // Mock indexing setup to initialize service
            mockQdrantClient.getCollections.mockResolvedValueOnce({ collections: [] });
            mockQdrantClient.createCollection.mockResolvedValueOnce({});

            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([]);

            await indexingService.startIndexing();
        });

        test('should return search results successfully', async () => {
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

        test('should return empty array when service not initialized', async () => {
            // Create new service without indexing
            const freshService = new IndexingService(mockConfigService, mockContext);
            const results = await freshService.search('test query');

            expect(results).toEqual([]);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Indexing service is not initialized. Cannot perform search.'
            );
        });

        test('should return empty array for failed embedding generation', async () => {
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
    });

    describe('dispose', () => {
        test('should clean up resources on dispose', async () => {
            const progressListener = vi.fn();
            indexingService.addProgressListener(progressListener);

            // Start indexing to set up cancellation token
            const mockConfig: QdrantOllamaConfig = {
                index_info: { name: 'test-index' },
                qdrant_config: { url: 'http://localhost:6333' },
                ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
            };

            vi.spyOn(mockConfigService, 'loadQdrantConfig').mockResolvedValueOnce(mockConfig);
            vi.spyOn(mockConfigService, 'validateConnection').mockResolvedValueOnce(true);
            vi.spyOn(mockConfigService, 'config', 'get').mockReturnValue({
                indexing: { enabled: true, maxFiles: 500, excludePatterns: [], includeExtensions: ['ts', 'js'] },
                search: { limit: 10, threshold: 0.7 },
                general: { trace: false }
            });

            (vi.mocked(vscode.workspace.findFiles)).mockResolvedValueOnce([]);

            // Start indexing (need to await to ensure the token is created before disposal)
            await indexingService.startIndexing(); 
            
            // Recreate the token source mock to track cancellation
            const tokenSource = indexingService['_cancellationTokenSource'];
            expect(tokenSource).toBeDefined();

            indexingService.dispose();

            // Should cancel any ongoing indexing
            expect(tokenSource?.cancel).toHaveBeenCalled();

            // Should clear progress listeners
            expect(indexingService['_progressListeners']).toEqual([]);
        });
    });
});