import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SnippetList from './SnippetList.svelte';
import { vscode } from '../lib/vscode';
import { appState } from '../store.svelte';

vi.mock('../lib/vscode');
vi.mock('../store.svelte');

describe('SnippetList', () => {
  const mockResults = [
    {
      uri: 'file:///test/file1.ts',
      filePath: 'src/file1.ts',
      snippet: 'function test1() { return 1; }',
      lineStart: 10,
      lineEnd: 12,
      score: 0.9
    },
    {
      uri: 'file:///test/file2.ts',
      filePath: 'src/file2.ts',
      snippet: 'function test2() { return 2; }',
      lineStart: 20,
      lineEnd: 22,
      score: 0.8
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (appState as any).results = mockResults;
  });

  it('should render search results correctly', () => {
    const { container } = render(SnippetList);

    const items = container.querySelectorAll('.group');
    expect(items).toHaveLength(2);

    expect(container.textContent).toContain('src/file1.ts');
    expect(container.textContent).toContain('function test1() { return 1; }');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('src/file2.ts');
    expect(container.textContent).toContain('function test2() { return 2; }');
    expect(container.textContent).toContain('20');
  });

  it('should handle empty results', () => {
    (appState as any).results = [];
    const { container } = render(SnippetList);

    const items = container.querySelectorAll('.group');
    expect(items).toHaveLength(0);
  });

  it('should handle undefined results', () => {
    (appState as any).results = undefined;
    const { container } = render(SnippetList);

    const items = container.querySelectorAll('.group');
    expect(items).toHaveLength(0);
  });

  it('should call openFile when snippet is clicked', async () => {
    const { container } = render(SnippetList);

    const firstItem = container.querySelector('.group');
    expect(firstItem).toBeTruthy();

    // Simulate onselect event for Command.Item
    await fireEvent.click(firstItem!);

    expect(vscode.postMessage).toHaveBeenCalledWith('file/open', {
      uri: 'file:///test/file1.ts',
      line: 10
    }, 'command');
  });

  it('should handle missing filePath gracefully', () => {
    (appState as any).results = [{
      uri: 'file:///test/unknown.ts',
      filePath: '',
      snippet: 'unknown code',
      lineStart: 1,
      lineEnd: 2,
      score: 0.5
    }];

    const { container } = render(SnippetList);
    expect(container.textContent).toContain('Unknown File');
  });

  it('should handle missing snippet gracefully', () => {
    (appState as any).results = [{
      uri: 'file:///test/empty.ts',
      filePath: 'src/empty.ts',
      snippet: '',
      lineStart: 1,
      lineEnd: 2,
      score: 0.5
    }];

    const { container } = render(SnippetList);
    const preElement = container.querySelector('pre code');
    expect(preElement?.textContent).toBe('');
  });

  it('should render with proper styling classes', () => {
    const { container } = render(SnippetList);

    const snippetList = container.querySelector('div[class*="flex flex-col gap-1"]');
    expect(snippetList).toBeTruthy();

    const firstItem = container.querySelector('.group');
    expect(firstItem).toHaveClass('flex', 'flex-col', 'text-left', 'gap-1');

    const codeElement = container.querySelector('pre code');
    expect(codeElement).toHaveClass('font-mono');
  });

  it('should display file icons and line numbers correctly', () => {
    const { container } = render(SnippetList);

    // Check for file code icons (lucide icons)
    const fileIcons = container.querySelectorAll('svg[class*="text-primary"]');
    expect(fileIcons.length).toBeGreaterThan(0);

    // Check for corner down right icons for line numbers
    const lineIcons = container.querySelectorAll('svg[class*="w-3 h-3"]');
    expect(lineIcons.length).toBeGreaterThan(0);
  });

  it('should generate unique keys using composite ID and index', () => {
    // Create duplicate results to test key uniqueness
    (appState as any).results = [
      {
        uri: 'file:///test/duplicate.ts',
        filePath: 'src/duplicate.ts',
        snippet: 'duplicate function',
        lineStart: 1,
        lineEnd: 2,
        score: 0.5
      },
      {
        uri: 'file:///test/duplicate.ts',
        filePath: 'src/duplicate.ts',
        snippet: 'another duplicate function',
        lineStart: 1,
        lineEnd: 2,
        score: 0.4
      }
    ];

    const { container } = render(SnippetList);

    const items = container.querySelectorAll('.group');
    expect(items).toHaveLength(2);

    // Both items should render despite having the same uri and lineStart
    expect(container.textContent).toContain('duplicate function');
    expect(container.textContent).toContain('another duplicate function');
  });

  it('should show correct line numbers', () => {
    const { container } = render(SnippetList);

    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('20');
  });

  it('should handle click on second item', async () => {
    const { container } = render(SnippetList);

    const items = container.querySelectorAll('.group');
    expect(items).toHaveLength(2);

    // Click on second item
    await fireEvent.click(items[1]!);

    expect(vscode.postMessage).toHaveBeenCalledWith('file/open', {
      uri: 'file:///test/file2.ts',
      line: 20
    }, 'command');
  });
});