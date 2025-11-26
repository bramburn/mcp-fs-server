import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SnippetList from './SnippetList';
import { IpcProvider, type HostIpc } from '../contexts/ipc';
import { OPEN_FILE_METHOD, type FileSnippetResult } from '../../protocol';
import { Command } from '../components/ui/command';

function renderWithIpc(
  ui: React.ReactElement,
  overrides: Partial<HostIpc> = {},
) {
  const ipc: HostIpc = {
    sendCommand: vi.fn(),
    sendRequest: vi.fn(),
    onNotification: vi.fn(),
    ...overrides,
  } as unknown as HostIpc;

  return {
    ipc,
    ...render(
      <IpcProvider value={ipc}>
        <Command>{ui}</Command>
      </IpcProvider>
    ),
  };
}

const mockResults: FileSnippetResult[] = [
  {
    uri: 'file:///one.ts',
    filePath: 'one.ts',
    snippet: 'const one = 1;',
    lineStart: 10,
    lineEnd: 12,
    score: 0.9,
  },
  {
    uri: 'file:///two.ts',
    filePath: 'two.ts',
    snippet: 'const two = 2;',
    lineStart: 20,
    lineEnd: 22,
    score: 0.8,
  },
];

describe('SnippetList', () => {
  it('renders nothing when results are empty', () => {
    renderWithIpc(<SnippetList results={[]} />);
    // No file name text should be present
    expect(screen.queryByText('one.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('two.ts')).not.toBeInTheDocument();
  });

  it('renders a list of snippets', () => {
    renderWithIpc(<SnippetList results={mockResults} />);

    expect(screen.getByText('one.ts')).toBeInTheDocument();
    expect(screen.getByText('two.ts')).toBeInTheDocument();
    expect(screen.getByText('const one = 1;')).toBeInTheDocument();
    expect(screen.getByText('const two = 2;')).toBeInTheDocument();
  });

  it('sends OPEN_FILE_METHOD command when an item is selected', () => {
    const { ipc } = renderWithIpc(<SnippetList results={mockResults} />);

    const firstItem = screen.getByText('one.ts');
    fireEvent.click(firstItem);

    expect(ipc.sendCommand).toHaveBeenCalledWith(
      OPEN_FILE_METHOD,
      'qdrantIndex',
      { uri: mockResults[0].uri, line: mockResults[0].lineStart },
    );
  });
});