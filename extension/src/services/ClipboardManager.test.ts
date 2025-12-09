import { describe, expect, it, vi } from 'vitest';
import { ClipboardManager } from './ClipboardManager.js';
import { ClipboardService } from './ClipboardService.js';
import { XmlParser } from './XmlParser.js';
import { WebviewController } from '../webviews/WebviewController.js';
import * as vscode from 'vscode';

vi.mock('vscode', () => {
    return {
        window: {
            setStatusBarMessage: vi.fn(),
            showInformationMessage: vi.fn(),
            showWarningMessage: vi.fn(),
            showErrorMessage: vi.fn(),
        },
        workspace: {
            fs: { stat: vi.fn() },
            workspaceFolders: [{ uri: { fsPath: '/root' } }],
            asRelativePath: vi.fn((p) => p),
        },
        Uri: { file: vi.fn() },
    };
});

describe('ClipboardManager', () => {
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

    const manager = new ClipboardManager(
        mockClipboardService,
        mockXmlParser,
        mockWebviewController
    );

    it('startMonitoring should enable capture', () => {
        vi.useFakeTimers();
        manager.startMonitoring(5);
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(true);
        vi.useRealTimers();
    });

    it('stopMonitoring should disable capture', () => {
        // We need to set monitoring to true first
        manager.startMonitoring(5);

        manager.stopMonitoring();
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(false);
    });

    it('toggleCapture should delegate to service', () => {
        manager.toggleCapture(true);
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(true);

        manager.toggleCapture(false);
        expect(mockClipboardService.setCaptureAll).toHaveBeenCalledWith(false);
    });
});
