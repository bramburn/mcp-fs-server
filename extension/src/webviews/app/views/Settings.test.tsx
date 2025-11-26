import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from './Settings';
import { IpcProvider, type HostIpc } from '../contexts/ipc';
import { useAppStore } from '../store';

type ViMockFn = ReturnType<typeof vi.fn>;
import {
  LOAD_CONFIG_METHOD,
  START_INDEX_METHOD,
  CONFIG_DATA_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  EXECUTE_COMMAND_METHOD,
  type QdrantOllamaConfig,
} from '../../protocol';

vi.mock('../store', async () => {
  const actual = await vi.importActual<typeof import('../store')>('../store');
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

type MockHostIpc = HostIpc & {
  sendCommand: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
};

function createMockIpc(): MockHostIpc {
  return {
    sendCommand: vi.fn(),
    sendRequest: vi.fn(),
    onNotification: vi.fn(),
  } as unknown as MockHostIpc;
}

function renderWithIpc(
  ui: React.ReactElement,
  ipc: MockHostIpc = createMockIpc(),
) {
  return {
    ipc,
    ...render(<IpcProvider value={ipc}>{ui}</IpcProvider>),
  };
}

describe('Settings view (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const useAppStoreMock = useAppStore as unknown as ViMockFn;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        config: undefined as QdrantOllamaConfig | undefined,
        setConfig: vi.fn(),
        indexStatus: 'ready' as const,
        setView: vi.fn(),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders basic layout sections', () => {
    renderWithIpc(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('requests config on mount when no config present', async () => {
    const ipc = createMockIpc();

    (ipc.sendRequest as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const setConfig = vi.fn();
    (useAppStore as unknown as ViMockFn).mockImplementation((selector: any) =>
      selector({
        config: undefined,
        setConfig,
        indexStatus: 'ready' as const,
        setView: vi.fn(),
      })
    );

    renderWithIpc(<Settings />, ipc);

    await waitFor(() => {
      expect(ipc.sendRequest).toHaveBeenCalledWith(
        LOAD_CONFIG_METHOD,
        'qdrantIndex',
        {}
      );
    });
  });

  it('subscribes to CONFIG_DATA_METHOD and updates config', () => {
    const ipc = createMockIpc();

    const setConfig = vi.fn();
    const useAppStoreMock = useAppStore as unknown as ViMockFn;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        config: undefined,
        setConfig,
        indexStatus: 'ready' as const,
        setView: vi.fn(),
      })
    );

    renderWithIpc(<Settings />, ipc);

    expect(ipc.onNotification).toHaveBeenCalledWith(
      CONFIG_DATA_METHOD,
      expect.any(Function)
    );

    const handlerCall = (ipc.onNotification as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === CONFIG_DATA_METHOD
    );
    const handler = handlerCall?.[1] as (cfg: QdrantOllamaConfig | null) => void;

    const cfg: QdrantOllamaConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
    };

    handler(cfg);

    expect(setConfig).toHaveBeenCalledWith(cfg);
  });

  it('renders configuration details when config is present', () => {
    const cfg: QdrantOllamaConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
    };

    const useAppStoreMock = useAppStore as unknown as ViMockFn;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        config: cfg,
        setConfig: vi.fn(),
        indexStatus: 'ready' as const,
        setView: vi.fn(),
      })
    );

    renderWithIpc(<Settings />);

    expect(screen.getByText(/Index Name:/i)).toHaveTextContent('test-index');
    expect(screen.getByText(/Qdrant URL:/i)).toHaveTextContent('http://localhost:6333');
    expect(screen.getByText(/Ollama Model:/i)).toHaveTextContent('nomic-embed-text');
  });

  it('triggers re-index when Force Re-index is clicked', async () => {
    const ipc = createMockIpc();

    renderWithIpc(<Settings />, ipc);

    const button = await screen.findByText('Force Re-index');
    await fireEvent.click(button);

    expect(ipc.sendCommand).toHaveBeenCalledWith(
      START_INDEX_METHOD,
      'qdrantIndex',
      {}
    );
  });

  it('sends EXECUTE_COMMAND_METHOD when Open Workspace Settings clicked', async () => {
    const ipc = createMockIpc();

    renderWithIpc(<Settings />, ipc);

    const button = await screen.findByText('Open Workspace Settings');
    await fireEvent.click(button);

    expect(ipc.sendCommand).toHaveBeenCalledWith(
      EXECUTE_COMMAND_METHOD,
      'webview-mgmt',
      { command: 'qdrant.openSettings' }
    );
  });

  it('updates showStale via DID_CHANGE_CONFIG_NOTIFICATION and sends update/preferences command', async () => {
    vi.useFakeTimers();
    const ipc = createMockIpc();

    renderWithIpc(<Settings />, ipc);

    expect(ipc.onNotification).toHaveBeenCalledWith(
      DID_CHANGE_CONFIG_NOTIFICATION,
      expect.any(Function)
    );

    const prefHandlerCall = (ipc.onNotification as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === DID_CHANGE_CONFIG_NOTIFICATION
    );
    const prefHandler = prefHandlerCall?.[1] as (params: { configKey: string; value: unknown }) => void;

    prefHandler({ configKey: 'overview.stale.show', value: true });

    vi.advanceTimersByTime(10);

    await waitFor(() => {
      expect(ipc.sendCommand).toHaveBeenCalledWith(
        'update/preferences',
        'webview-mgmt',
        { 'overview.stale.show': true }
      );
    });
  });
});