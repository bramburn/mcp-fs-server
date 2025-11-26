import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPaletteTest from './CommandPaletteTest';
import { IpcProvider, type HostIpc } from '../contexts/ipc';

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

function renderWithIpc(ipc: MockHostIpc = createMockIpc()) {
  return {
    ipc,
    ...render(
      <IpcProvider value={ipc}>
        <CommandPaletteTest />
      </IpcProvider>
    ),
  };
}

describe('CommandPaletteTest (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header and IPC status', () => {
    renderWithIpc();

    expect(
      screen.getByText('Command Palette Component Test')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IPC Context:/)
    ).toBeInTheDocument();
  });

  it('toggles visibility when button is clicked', () => {
    renderWithIpc();

    const toggleButton = screen.getByRole('button', {
      name: /Hide Command Palette/i,
    });

    // Initially visible (button says "Hide")
    expect(toggleButton).toBeInTheDocument();
    expect(
      screen.getByText('File Operations')
    ).toBeInTheDocument();

    fireEvent.click(toggleButton);

    // After click, palette should be hidden (button text changes)
    expect(
      screen.getByRole('button', { name: /Show Command Palette/i })
    ).toBeInTheDocument();
  });

  it('filters commands based on search query', () => {
    renderWithIpc();

    const input = screen.getByPlaceholderText(
      'Type a command or search...'
    ) as HTMLInputElement;

    // All commands visible initially
    expect(screen.getByText('New File')).toBeInTheDocument();
    expect(screen.getByText('Save File')).toBeInTheDocument();
    expect(screen.getByText('Open File')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'New' } });

    // Now only "New File" should match
    expect(screen.getByText('New File')).toBeInTheDocument();
    expect(screen.queryByText('Save File')).not.toBeInTheDocument();
    expect(screen.queryByText('Open File')).not.toBeInTheDocument();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
  });

  it('invokes ipc.sendCommand when a command item is selected', async () => {
    const ipc = createMockIpc();

    renderWithIpc(ipc);

    // Click an item in "File Operations"
    const newFileItem = screen.getByText('New File');
    fireEvent.click(newFileItem);

    expect(ipc.sendCommand).toHaveBeenCalledTimes(1);
    const [method, scope, params] = (ipc.sendCommand as ReturnType<typeof vi.fn>).mock
      .calls[0];

    expect(method).toBe('webview/execute-command');
    expect(scope).toBe('webview-mgmt');
    expect(params).toEqual({
      command: 'workbench.action.files.newUntitledFile',
    });
  });
});