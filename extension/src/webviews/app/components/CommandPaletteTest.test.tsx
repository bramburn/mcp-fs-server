/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPaletteTest from './CommandPaletteTest';
import { IpcProvider, type HostIpc } from '../contexts/ipc';
import { FluentWrapper } from '../providers/FluentWrapper';

type MockHostIpc = HostIpc & {
  sendCommand: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
};

function createMockIpc(): MockHostIpc {
  return {
    sendCommand: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(),
  } as unknown as MockHostIpc;
}

function renderWithIpc(ipc: MockHostIpc = createMockIpc()) {
  return {
    ipc,
    ...render(
      <FluentWrapper>
        <IpcProvider value={ipc}>
          <CommandPaletteTest />
        </IpcProvider>
      </FluentWrapper>
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
      screen.getByText('Command Palette Test')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IPC:/)
    ).toBeInTheDocument();
  });

  it('toggles visibility when button is clicked', () => {
    renderWithIpc();

    const toggleButton = screen.getByRole('button', {
      name: /Hide Palette/i,
    });

    // Initially visible (button says "Hide")
    expect(toggleButton).toBeInTheDocument();
    
    // Check for a specific command to ensure list is visible
    expect(
      screen.getByText('New File')
    ).toBeInTheDocument();

    fireEvent.click(toggleButton);

    // After click, palette should be hidden (button text changes)
    expect(
      screen.getByRole('button', { name: /Show Palette/i })
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