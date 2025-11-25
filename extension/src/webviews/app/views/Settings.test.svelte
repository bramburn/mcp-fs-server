import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Settings from './Settings.svelte';
import { appState } from '../store.svelte';
import { vscode } from '../lib/vscode';

vi.mock('../lib/vscode');
vi.mock('../store.svelte');

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    (appState as any).config = null;
    (appState as any).indexStatus = 'ready';
    (appState as any).setView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render settings interface correctly', () => {
    const { container } = render(Settings);

    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Configuration');
    expect(container.textContent).toContain('Actions');
    expect(container.textContent).toContain('Status');
  });

  it('should show loading configuration message', () => {
    (appState as any).config = null;
    const { container } = render(Settings);

    // Should trigger config refresh effect and show loading
    expect(vscode.postMessage).toHaveBeenCalledWith('config/load', {}, 'request');
  });

  it('should display configuration when loaded', () => {
    const mockConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { model: 'nomic-embed-text' }
    };
    (appState as any).config = mockConfig;

    const { container } = render(Settings);

    expect(container.textContent).toContain('Index Name: test-index');
    expect(container.textContent).toContain('Qdrant URL: http://localhost:6333');
    expect(container.textContent).toContain('Ollama Model: nomic-embed-text');
  });

  it('should show configuration error when no config', async () => {
    (appState as any).config = null;
    const { container } = render(Settings);

    // Wait for loading timeout
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(container.textContent).toContain('No configuration loaded');
      expect(container.textContent).toContain('.qdrant/configuration.json');
    });
  });

  it('should request config refresh when refresh button clicked', async () => {
    const { container } = render(Settings);
    const refreshButton = container.querySelector('button.text-primary') as HTMLButtonElement;

    await fireEvent.click(refreshButton);

    expect(vscode.postMessage).toHaveBeenCalledWith('config/load', {}, 'request');
  });

  it('should trigger re-index when re-index button clicked', async () => {
    const { container } = render(Settings);
    const reindexButton = container.querySelector('button.w-full.px-3.py-2.bg-primary') as HTMLButtonElement;

    await fireEvent.click(reindexButton);

    expect(vscode.postMessage).toHaveBeenCalledWith('index/start', {}, 'command');
  });

  it('should disable re-index button during indexing', () => {
    (appState as any).indexStatus = 'indexing';
    const { container } = render(Settings);
    const reindexButton = container.querySelector('button.w-full.px-3.py-2.bg-primary') as HTMLButtonElement;

    expect(reindexButton.disabled).toBe(true);
    expect(reindexButton.textContent).toContain('Indexing...');
  });

  it('should navigate back to search when back button clicked', async () => {
    const { container } = render(Settings);
    const backButton = container.querySelector('button.p-1') as HTMLButtonElement;

    await fireEvent.click(backButton);

    expect((appState as any).setView).toHaveBeenCalledWith('search');
  });

  it('should open workspace settings when settings button clicked', async () => {
    const { container } = render(Settings);
    const settingsButton = container.querySelectorAll('button.w-full')[0] as HTMLButtonElement;

    await fireEvent.click(settingsButton);

    expect(vscode.postMessage).toHaveBeenCalledWith('qdrant.openSettings', {}, 'command');
  });

  it('should show correct status indicator for ready state', () => {
    (appState as any).indexStatus = 'ready';
    const { container } = render(Settings);

    expect(container.querySelector('.bg-green-500')).toBeTruthy();
    expect(container.textContent).toContain('Index Ready');
  });

  it('should show correct status indicator for indexing state', () => {
    (appState as any).indexStatus = 'indexing';
    const { container } = render(Settings);

    expect(container.querySelector('.bg-yellow-500')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    expect(container.textContent).toContain('Indexing in progress...');
  });

  it('should show correct status indicator for error state', () => {
    (appState as any).indexStatus = 'error';
    const { container } = render(Settings);

    expect(container.querySelector('.bg-red-500')).toBeTruthy();
    expect(container.textContent).toContain('Index Error');
  });

  it('should handle missing optional config fields gracefully', () => {
    const partialConfig = {
      index_info: {}, // missing name
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { model: 'nomic-embed-text' }
    };
    (appState as any).config = partialConfig;

    const { container } = render(Settings);

    expect(container.textContent).toContain('Index Name: Not configured');
    expect(container.textContent).toContain('Qdrant URL: http://localhost:6333');
    expect(container.textContent).toContain('Ollama Model: nomic-embed-text');
  });

  it('should handle completely missing config fields', () => {
    const emptyConfig = {};
    (appState as any).config = emptyConfig;

    const { container } = render(Settings);

    expect(container.textContent).toContain('Index Name: Not configured');
    expect(container.textContent).toContain('Qdrant URL: Not configured');
    expect(container.textContent).toContain('Ollama Model: Not configured');
  });

  it('should stop loading state after timeout', async () => {
    (appState as any).config = null;
    const { container } = render(Settings);

    // Initially should not show the loading message because we only show it if !loading && !config
    expect(container.textContent).not.toContain('Loading configuration...');

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(container.textContent).toContain('No configuration loaded');
    });
  });

  it('should render with proper CSS classes', () => {
    const { container } = render(Settings);

    const mainContainer = container.querySelector('.flex.flex-col.h-full.w-full');
    expect(mainContainer).toBeTruthy();

    const header = container.querySelector('.sticky.top-0.z-10');
    expect(header).toBeTruthy();

    const content = container.querySelector('.flex-1.overflow-y-auto.min-h-0');
    expect(content).toBeTruthy();
  });

  it('should display settings icon in header', () => {
    const { container } = render(Settings);

    const settingsIcon = container.querySelector('svg.text-primary');
    expect(settingsIcon).toBeTruthy();
  });

  it('should show back button with chevron', () => {
    const { container } = render(Settings);

    const backButton = container.querySelector('button.p-1');
    expect(backButton).toBeTruthy();

    const chevronIcon = backButton?.querySelector('svg');
    expect(chevronIcon).toBeTruthy();
  });

  it('should handle multiple refresh clicks properly', async () => {
    const { container } = render(Settings);
    const refreshButton = container.querySelector('button.text-primary') as HTMLButtonElement;

    await fireEvent.click(refreshButton);
    await fireEvent.click(refreshButton);

    // Should send config load request for each click
    expect(vscode.postMessage).toHaveBeenCalledTimes(2);
    expect(vscode.postMessage).toHaveBeenNthCalledWith(1, 'config/load', {}, 'request');
    expect(vscode.postMessage).toHaveBeenNthCalledWith(2, 'config/load', {}, 'request');
  });

  it('should show config in styled container', () => {
    const mockConfig = {
      index_info: { name: 'test-index' },
      qdrant_config: { url: 'http://localhost:6333' },
      ollama_config: { model: 'nomic-embed-text' }
    };
    (appState as any).config = mockConfig;

    const { container } = render(Settings);

    const configContainer = container.querySelector('div[class*="bg-secondary/20"]');
    expect(configContainer).toBeTruthy();
    expect(configContainer?.textContent).toContain('test-index');
  });

  it('should show error message in styled warning container', async () => {
    (appState as any).config = null;
    const { container } = render(Settings);

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      const warningContainer = container.querySelector('div[class*="bg-yellow-500/10"]');
      expect(warningContainer).toBeTruthy();
      expect(warningContainer?.textContent).toContain('No configuration loaded');
    });
  });
});