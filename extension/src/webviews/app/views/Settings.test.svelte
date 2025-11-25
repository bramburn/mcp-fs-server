import { describe, test, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import Settings from './Settings.svelte';

// Mock the VS Code API globally for testing IPC
let apiMock: { postMessage: ReturnType<typeof vi.fn> };

// Mock necessary IPC types/constructors for testing
const UpdatePreferencesCommand = { with: (data: any) => ({ type: 'UpdatePreferencesCommand', payload: data }) };
const LOAD_CONFIG_METHOD = { with: (data: any) => ({ type: 'LoadConfig', payload: data }) };
const START_INDEX_METHOD = { with: (data: any) => ({ type: 'StartIndex', payload: data }) };

beforeAll(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  apiMock = { postMessage: vi.fn() };
  globalThis.getVsCodeApi = () => apiMock;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Settings View Interaction (Svelte 5 Runes)', () => {
  
  test('should render settings interface correctly', () => {
    const { container } = render(Settings);

    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Configuration');
    expect(container.textContent).toContain('Actions');
    expect(container.textContent).toContain('Status');
  });

  test('should request config load on mount if config is missing', () => {
    // Initial render triggers $effect.pre which calls refreshConfig, which calls postMessage
    render(Settings);

    expect(apiMock.postMessage).toHaveBeenCalledWith(LOAD_CONFIG_METHOD.with({}));
  });

  test('should display configuration when loaded', () => {
    const mockConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { model: 'nomic-embed-text' }
    };
    // Render with initial config set in props to bypass store dependency
    render(Settings, { props: { appState: { config: mockConfig, indexStatus: 'ready', setView: vi.fn() } } });

    expect(screen.getByText(/Index Name:/i).textContent).toContain('test-index');
    expect(screen.getByText(/Qdrant URL:/i).textContent).toContain('http://localhost:6333');
    expect(screen.getByText(/Ollama Model:/i).textContent).toContain('nomic-embed-text');
  });

  test('should show configuration error when no config', async () => {
    render(Settings, { props: { appState: { config: null, indexStatus: 'ready', setView: vi.fn() } } });

    // Wait for loading timeout
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/No configuration loaded/i)).toBeTruthy();
      expect(screen.getByText(/.qdrant\/configuration.json/i)).toBeTruthy();
    });
  });

  test('should request config refresh when refresh button clicked', async () => {
    render(Settings);
    const refreshButton = (await screen.findByText('Refresh')) as HTMLButtonElement;

    await fireEvent.click(refreshButton);

    expect(apiMock.postMessage).toHaveBeenCalledWith(LOAD_CONFIG_METHOD.with({}));
  });

  test('should trigger re-index when re-index button clicked', async () => {
    render(Settings);
    const reindexButton = (await screen.findByText('Force Re-index')) as HTMLButtonElement;

    await fireEvent.click(reindexButton);

    expect(apiMock.postMessage).toHaveBeenCalledWith(START_INDEX_METHOD.with({}));
  });

  test('should disable re-index button during indexing', async () => {
    // Render with indexStatus set to 'indexing' via props
    render(Settings, { props: { appState: { config: null, indexStatus: 'indexing', setView: vi.fn() } } });
    
    const reindexButton = (await screen.findByText('Indexing...')) as HTMLButtonElement;

    expect(reindexButton.disabled).toBe(true);
  });

  test('should send UpdatePreferencesCommand when switch is toggled', async () => {
    // Mock initial config to set the baseline for the switch (initial state: false)
    const mockConfig = {
      stale: { show: false } 
    };
    render(Settings, { props: { appState: { config: mockConfig, indexStatus: 'ready', setView: vi.fn() } } });

    // Find the switch element by its label
    const switchElement = (await screen.findByText('Show Stale Results')).closest('div')?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(switchElement).not.toBeChecked();

    // Simulate user click to toggle it ON
    await fireEvent.click(switchElement);

    // Advance timers to allow $effect to run (though preference update is usually immediate)
    vi.advanceTimersByTime(10); 

    // Assert the IPC command was sent
    expect(apiMock.postMessage).toHaveBeenCalledTimes(1);
    const call = apiMock.postMessage.mock.calls;
    expect(call.type).toBe('UpdatePreferencesCommand');
    
    // Assert that the payload contains the new setting state
    expect(call.payload.changes).toEqual({
      'overview.stale.show': true,
    });
  });

  test('should show correct status indicator for error state', async () => {
    render(Settings, { props: { appState: { config: null, indexStatus: 'error', setView: vi.fn() } } });

    // Wait for loading timeout to ensure error state is fully rendered
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      const statusIndicator = screen.getByText(/Index Error/i).previousElementSibling;
      expect(statusIndicator).toHaveClass('bg-red-500');
    });
  });
});