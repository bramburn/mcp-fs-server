import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
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

// Mock vscode.window
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
    }
}));

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
        expect(vi.mocked(require('vscode').window.setStatusBarMessage)).toHaveBeenCalledWith(
            expect.stringContaining('Capturing all'),
            expect.any(Number)
        );
    });

    it('should disable capture-all when monitoring stops', () => {
        // First start it
        clipboardManager.startMonitoring(5);
        mockClipboardService.setCaptureAll.mockClear();

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