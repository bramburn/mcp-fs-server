import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Search from './Search';
import { IpcProvider, type HostIpc } from '../contexts/ipc';
import { useAppStore } from '../store';

type ViMockFn = ReturnType<typeof vi.fn>;
import {
  SEARCH_METHOD,
  START_INDEX_METHOD,
  type SearchRequestParams,
  type SearchResponseParams,
} from '../../protocol';

vi.mock('../store', async () => {
  const actual = await vi.importActual<typeof import('../store')>('../store');
  return {
    ...actual,
    useAppStore: vi.fn(actual.useAppStore),
  };
});

function renderWithIpc(ui: React.ReactElement, ipcOverrides: Partial<HostIpc> = {}) {
  const baseIpc: HostIpc = {
    sendCommand: vi.fn() as HostIpc['sendCommand'],
    sendRequest: vi.fn() as HostIpc['sendRequest'],
    onNotification: vi.fn() as HostIpc['onNotification'],
  };

  const ipc: HostIpc = {
    ...baseIpc,
    ...ipcOverrides,
  };

  return {
    ipc,
    ...render(<IpcProvider value={ipc}>{ui}</IpcProvider>),
  };
}

describe('Search view (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const useAppStoreMock = useAppStore as unknown as ViMockFn;
    useAppStoreMock.mockImplementation((selector: any) =>
      selector({
        indexStatus: 'ready',
        setView: vi.fn(),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial UI', () => {
    renderWithIpc(<Search />);

    expect(
      screen.getByText('Semantic Code Search')
    ).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search codebase...')
    ).toBeInTheDocument();
  });

  it('debounces search input and sends SEARCH_METHOD request', async () => {
    const sendRequest = vi.fn(
      async (method: string, scope: string, params: SearchRequestParams) => {
        expect(method).toBe(SEARCH_METHOD);
        expect(scope).toBe('qdrantIndex');
        expect(params.query).toBe('test');
        const response: SearchResponseParams = { results: [] };
        return response;
      }
    );

    renderWithIpc(<Search />, { sendRequest: sendRequest as HostIpc['sendRequest'] });

    const input = screen.getByPlaceholderText('Search codebase...') as HTMLInputElement;

    await fireEvent.change(input, { target: { value: 'test' } });

    expect(sendRequest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledTimes(1);
      const [method, scope, params] = sendRequest.mock.calls[0];
      expect(method).toBe(SEARCH_METHOD);
      expect(scope).toBe('qdrantIndex');
      expect((params as SearchRequestParams).query).toBe('test');
    });
  });

  it('does not send search for short queries (length <= 2)', () => {
    const sendRequest = vi.fn();

    renderWithIpc(<Search />, { sendRequest });

    const input = screen.getByPlaceholderText('Search codebase...') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'te' } });
    vi.advanceTimersByTime(300);

    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('triggers START_INDEX_METHOD when Re-Index is clicked', async () => {
    const sendCommand = vi.fn();

    renderWithIpc(<Search />, { sendCommand });

    const button = await screen.findByText('Re-Index');
    await fireEvent.click(button);

    expect(sendCommand).toHaveBeenCalledWith(
      START_INDEX_METHOD,
      'qdrantIndex',
      {}
    );
  });

  it('shows empty state text initially', () => {
    renderWithIpc(<Search />);

    expect(
      screen.getByText('Start typing to search...')
    ).toBeInTheDocument();
  });
});