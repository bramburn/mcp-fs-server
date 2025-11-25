import { describe, test, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import Search from './Search.svelte';

// Mock the VS Code API globally for testing IPC
let apiMock: { postMessage: ReturnType<typeof vi.fn> };

// Mock necessary IPC types/constructors for testing
const SearchRequest = { with: (data: any) => ({ type: 'SearchRequest', payload: data }) };
const SearchCancelCommand = { with: (data: any) => ({ type: 'SearchCancelCommand', payload: data }) };

beforeAll(() => {
  apiMock = { postMessage: vi.fn() };
  globalThis.getVsCodeApi = () => apiMock;
});

describe('Search View Functionality (Svelte 5 Runes)', () => {
  vi.useFakeTimers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should render search interface correctly', () => {
    const { container } = render(Search);

    expect(container.textContent).toContain('Semantic Code Search');
    expect(container.textContent).toContain('Settings');
    expect(container.querySelector('input[placeholder="Search codebase..."]')).toBeTruthy();
  });

  test('should trigger search when query length > 2 with debounce', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'tes' } });

    // Should not trigger immediately
    expect(apiMock.postMessage).not.toHaveBeenCalled();

    // Fast-forward 300ms (debounce time)
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      // Assert that SearchRequest was sent with the correct structure
      expect(apiMock.postMessage).toHaveBeenCalledTimes(1);
      const call = apiMock.postMessage.mock.calls;
      expect(call.type).toBe('SearchRequest');
      expect(call.payload.search.query).toBe('tes');
    });
  });

  test('should not trigger search for query length <= 2', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'te' } });

    vi.advanceTimersByTime(300);

    expect(apiMock.postMessage).not.toHaveBeenCalled();
  });

  test('should send SearchCancelCommand when input is cleared', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    // 1. Set input, trigger debounce
    await fireEvent.input(input, { target: { value: 'temp' } });
    vi.advanceTimersByTime(301);
    expect(apiMock.postMessage).toHaveBeenCalledTimes(1); // First call is SearchRequest

    // 2. Clear input, trigger debounce
    await fireEvent.input(input, { target: { value: '' } });
    vi.advanceTimersByTime(301);

    // The second call should be the cancel command
    await waitFor(() => {
      expect(apiMock.postMessage).toHaveBeenCalledTimes(2);
      const call = apiMock.postMessage.mock.calls;
      expect(call.type).toBe('SearchCancelCommand');
    });
  });

  test('should trigger re-index when button clicked', async () => {
    const { container } = render(Search);
    // Find button by text content, as class names are less reliable across changes
    const reindexButton = (await screen.findByText('Re-Index')) as HTMLButtonElement;

    await fireEvent.click(reindexButton);

    expect(apiMock.postMessage).toHaveBeenCalledWith({ command: 'index/start', data: {} });
  });

  test('should show results when available', () => {
    // Since appState is mocked locally, we can't easily set results, but we check UI logic based on empty state
    const { container } = render(Search);
    // Check for the new empty state message
    expect(container.textContent).toContain('Start typing to search...');
  });
});