import { describe, expect, it, vi } from 'vitest';
import { ClipboardHandler } from './ClipboardHandler.js';
import { ClipboardManager } from '../../services/ClipboardManager.js';
import { IndexingService } from '../../services/IndexingService.js';
import { MONITOR_START_COMMAND, MONITOR_STOP_COMMAND, TOGGLE_CAPTURE_COMMAND } from '../protocol.js';

vi.mock('../../services/ClipboardManager.js');
vi.mock('../../services/IndexingService.js');

describe('ClipboardHandler', () => {
    const mockClipboardManager = {
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        toggleCapture: vi.fn(),
    } as unknown as ClipboardManager;

    const mockIndexingService = {} as unknown as IndexingService;

    const handler = new ClipboardHandler(mockClipboardManager, mockIndexingService);

    it('should call startMonitoring on MONITOR_START_COMMAND', async () => {
        await handler.handleCommand({
            kind: 'command',
            method: MONITOR_START_COMMAND,
            params: { duration: 10 },
            id: '1',
            scope: 'debugger',
            timestamp: 123
        }, {} as any);

        expect(mockClipboardManager.startMonitoring).toHaveBeenCalledWith(10);
    });

    it('should call stopMonitoring on MONITOR_STOP_COMMAND', async () => {
        await handler.handleCommand({
            kind: 'command',
            method: MONITOR_STOP_COMMAND,
            params: {},
            id: '1',
            scope: 'debugger',
            timestamp: 123
        }, {} as any);

        expect(mockClipboardManager.stopMonitoring).toHaveBeenCalled();
    });

    it('should call toggleCapture on TOGGLE_CAPTURE_COMMAND', async () => {
        await handler.handleCommand({
            kind: 'command',
            method: TOGGLE_CAPTURE_COMMAND,
            params: { enabled: true },
            id: '1',
            scope: 'debugger',
            timestamp: 123
        }, {} as any);

        expect(mockClipboardManager.toggleCapture).toHaveBeenCalledWith(true);
    });
});
