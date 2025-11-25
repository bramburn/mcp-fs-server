import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Search from './Search.svelte';
import { appState } from '../store.svelte';
import { vscode } from '../lib/vscode';

vi.mock('../lib/vscode');
vi.mock('../store.svelte');

describe('Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    (appState as any).query = '';
    (appState as any).isSearching = false;
    (appState as any).indexStatus = 'ready';
    (appState as any).results = [];
    (appState as any).setView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render search interface correctly', () => {
    const { container } = render(Search);

    expect(container.textContent).toContain('Semantic Code Search');
    expect(container.textContent).toContain('Settings');
    expect(container.querySelector('input[placeholder="Search codebase..."]')).toBeTruthy();
  });

  it('should update query on input', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'test query' } });

    expect((appState as any).query).toBe('test query');
  });

  it('should trigger search on Enter key', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'test query' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(vscode.postMessage).toHaveBeenCalledWith('search', { query: 'test query' }, 'request');
    });
  });

  it('should trigger search when query length > 2 with debounce', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'tes' } });

    // Should not trigger immediately
    expect(vscode.postMessage).not.toHaveBeenCalled();

    // Fast-forward 300ms (debounce time)
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(vscode.postMessage).toHaveBeenCalledWith('search', { query: 'tes' }, 'request');
    });

    expect((appState as any).isSearching).toBe(true);
  });

  it('should not trigger search for query length <= 2', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'te' } });

    vi.advanceTimersByTime(300);

    expect(vscode.postMessage).not.toHaveBeenCalled();
    expect((appState as any).isSearching).toBe(false);
  });

  it('should debounce search input properly', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 't' } });
    expect(vscode.postMessage).not.toHaveBeenCalled();

    await fireEvent.input(input, { target: { value: 'te' } });
    expect(vscode.postMessage).not.toHaveBeenCalled();

    await fireEvent.input(input, { target: { value: 'tes' } });

    vi.advanceTimersByTime(299);
    expect(vscode.postMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await waitFor(() => {
      expect(vscode.postMessage).toHaveBeenCalledWith('search', { query: 'tes' }, 'request');
    });
  });

  it('should show indexing status', () => {
    (appState as any).indexStatus = 'indexing';
    const { container } = render(Search);

    expect(container.textContent).toContain('Indexing...');
    expect(container.querySelector('.bg-yellow-500')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('should show ready status', () => {
    (appState as any).indexStatus = 'ready';
    const { container } = render(Search);

    expect(container.textContent).toContain('Index Ready');
    expect(container.querySelector('.bg-green-500')).toBeTruthy();
  });

  it('should show error status', () => {
    (appState as any).indexStatus = 'error';
    const { container } = render(Search);

    expect(container.textContent).toContain('Index Ready'); // error falls back to ready in UI
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('should trigger re-index when button clicked', async () => {
    const { container } = render(Search);
    const reindexButton = container.querySelector('button.px-2.py-1') as HTMLButtonElement;

    await fireEvent.click(reindexButton);

    expect(vscode.postMessage).toHaveBeenCalledWith('index/start', {}, 'command');
  });

  it('should disable re-index button during indexing', () => {
    (appState as any).indexStatus = 'indexing';
    const { container } = render(Search);
    const reindexButton = container.querySelector('button.px-2.py-1') as HTMLButtonElement;

    expect(reindexButton.disabled).toBe(true);
    expect(reindexButton.textContent).toContain('Re-Index');
  });

  it('should show no results message when empty', () => {
    (appState as any).results = [];
    (appState as any).isSearching = false;
    const { container } = render(Search);

    expect(container.textContent).toContain('No results found. Try indexing your workspace or changing your query.');
  });

  it('should navigate to settings when settings button clicked', async () => {
    const { container } = render(Search);
    const settingsButton = container.querySelector('button.text-primary') as HTMLButtonElement;

    await fireEvent.click(settingsButton);

    expect((appState as any).setView).toHaveBeenCalledWith('settings');
  });

  it('should not show no results message when searching', () => {
    (appState as any).results = [];
    (appState as any).isSearching = true;
    const { container } = render(Search);

    expect(container.textContent).not.toContain('No results found.');
  });

  it('should show results when available', () => {
    (appState as any).results = [
      { uri: 'test://file1.ts', snippet: 'code1', score: 0.9 }
    ];
    (appState as any).isSearching = false;
    const { container } = render(Search);

    expect(container.textContent).not.toContain('No results found.');
  });

  it('should render with proper CSS classes', () => {
    const { container } = render(Search);

    const mainContainer = container.querySelector('.flex.h-full.w-full');
    expect(mainContainer).toBeTruthy();

    const header = container.querySelector('.sticky.top-0.z-10');
    expect(header).toBeTruthy();

    const input = container.querySelector('input[placeholder="Search codebase..."]');
    expect(input).toHaveClass('flex', 'h-9', 'w-full');
  });

  it('should handle multiple keydown events', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'test' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.keyDown(input, { key: 'Enter' }); // Second Enter

    // Should only trigger once due to debounce and search state
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(vscode.postMessage).toHaveBeenCalledTimes(1);
    });
  });

  it('should ignore non-Enter key events', async () => {
    const { container } = render(Search);
    const input = container.querySelector('input[placeholder="Search codebase..."]') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: 'test' } });
    await fireEvent.keyDown(input, { key: 'Escape' });
    await fireEvent.keyDown(input, { key: 'Tab' });

    vi.advanceTimersByTime(300);

    expect(vscode.postMessage).not.toHaveBeenCalled();
  });
});