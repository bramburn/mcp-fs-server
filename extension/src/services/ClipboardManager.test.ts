import { beforeEach, describe, expect, it, vi } from 'vitest';
// Removed unused type import: import type * as vscode from 'vscode'; 
import { ClipboardManager } from './ClipboardManager.js';
import { ClipboardService } from './ClipboardService.js';
import { XmlParser } from './XmlParser.js';
import { WebviewController } from '../webviews/WebviewController.js';

// Mock dependencies
const mockClipboardService = {
    setCaptureAll: vi.fn(),
    onTriggerXml: vi.fn(() => ({ dispose: vi.fn() })),
    onClipboardUpdate: vi.fn(() => ({ dispose: vi.fn() })),
} as unknown as ClipboardService;

const mockXmlParser = {
    parse: vi.fn(),
} as unknown as XmlParser;

const mockWebviewController = {
    sendToWebview: vi.fn(),
} as unknown as WebviewController;

// Mock vscode.window globally since the test environment sets up a global vscode mock
vi.mock('vscode', () => ({
    window: {
        setStatusBarMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
    },
    workspace: {
        asRelativePath: vi.fn((p) => p),
        workspaceFolders: [{ uri: { fsPath: '/root' } }],
        fs: { stat: vi.fn() }
    },
    Uri: {
        file: vi.fn(),
        joinPath: vi.fn(),
    },
    // Need to export the mocks to be accessible globally
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    // Add the mocked objects needed for the global export
    window: {
        setStatusBarMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
    },
}));

// Import the global vscode mock for type safety and usage
import * as vscode from 'vscode';

describe('ClipboardManager', () => {
    let clipboardManager: ClipboardManager;

    beforeEach(() => {
        vi.clearAllMocks();
        clipboardManager = new ClipboardManager(
            mockClipboardService,
            mockXmlParser,
            mockWebviewController
        );
    });

    it('should enable capture-all when monitoring starts', () => {
        clipboardManager.startMonitoring(5);
        
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(true);
        
        // [FIX] Use the globally defined vscode mock directly
        expect(vi.mocked(vscode.window.setStatusBarMessage)).toHaveBeenCalledWith(
            expect.stringContaining('Capturing all'),
            expect.any(Number)
        );
    });

    it('should disable capture-all when monitoring stops', () => {
        // First start it
        clipboardManager.startMonitoring(5);
        
        // [FIX] Use vi.mocked to assert the type of the mock function and call mockClear
        vi.mocked(mockClipboardService.setCaptureAll).mockClear();

        clipboardManager.stopMonitoring();

        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(false);
    });

    it('should toggle capture explicitly', () => {
        clipboardManager.toggleCapture(true);
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(true);

        clipboardManager.toggleCapture(false);
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(false);
    });
});