import { useState, useMemo, useCallback } from 'react';
import { useIpc } from '../contexts/ipc';
import type { IpcScope } from '../../protocol';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandItem,
} from '../components/ui/command';

interface PaletteCommand {
  label: string;
  description: string;
  action: {
    command: string;
    params?: Record<string, unknown>;
    scope: IpcScope;
  };
}

const fileCommands: PaletteCommand[] = [
  {
    label: 'New File',
    description: 'Create a new file',
    action: {
      command: 'webview/execute-command',
      params: { command: 'workbench.action.files.newUntitledFile' },
      scope: 'webview-mgmt',
    },
  },
  {
    label: 'Save File',
    description: 'Save the current file',
    action: {
      command: 'webview/execute-command',
      params: { command: 'workbench.action.files.save' },
      scope: 'webview-mgmt',
    },
  },
];

const sampleCommands: PaletteCommand[] = [
  {
    label: 'Open File',
    description: 'Open a file in the editor',
    action: {
      command: 'file/open',
      params: { uri: 'file:///example.txt', line: 1 },
      scope: 'qdrantIndex',
    },
  },
  {
    label: 'Search',
    description: 'Search for files',
    action: {
      command: 'search',
      params: { query: 'test' },
      scope: 'qdrantIndex',
    },
  },
  {
    label: 'Settings',
    description: 'Open extension settings',
    action: {
      command: 'webview/execute-command',
      params: {
        command: 'workbench.action.openSettings',
        args: ['mcpFsServer'],
      },
      scope: 'webview-mgmt',
    },
  },
];

export default function CommandPaletteTest() {
  const ipc = useIpc();

  const [isVisible, setIsVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  const allCommands = useMemo(
    () => [...fileCommands, ...sampleCommands],
    []
  );

  const ipcAvailable = Boolean(ipc);

  const toggleVisibility = useCallback(() => {
    setIsVisible((v) => !v);
  }, []);

  const handleSelect = useCallback(
    (value: string) => {
      setSelectedValue(value);

      const cmd = allCommands.find((c) => c.label === value);
      if (!cmd) {
        // eslint-disable-next-line no-console
        console.warn('No command found for value:', value);
        return;
      }

      ipc.sendCommand(cmd.action.command, cmd.action.scope, cmd.action.params ?? {});
    },
    [allCommands, ipc]
  );

  const filteredFileCommands = useMemo(
    () =>
      fileCommands.filter((cmd) =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [searchQuery]
  );

  const filteredSampleCommands = useMemo(
    () =>
      sampleCommands.filter((cmd) =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [searchQuery]
  );

  return (
    <div className="p-5 min-h-screen font-sans text-[13px] bg-[color:var(--vscode-editor-background)] text-[color:var(--vscode-foreground)]">
      <h2 className="text-base font-semibold mb-3">
        Command Palette Component Test
      </h2>

      <div className="flex items-center gap-4 mb-5">
        <button
          type="button"
          onClick={toggleVisibility}
          className="px-4 py-2 rounded bg-[color:var(--vscode-button-background)] text-[color:var(--vscode-button-foreground)] text-xs"
        >
          {isVisible ? 'Hide' : 'Show'} Command Palette
        </button>
        <div className="text-xs text-[color:var(--vscode-descriptionForeground)]">
          IPC Context: {ipcAvailable ? '✅ Available' : '❌ Not Available'}
        </div>
      </div>

      {isVisible && (
        <Command
          value={selectedValue}
          onValueChange={handleSelect}
          filter={() => 1}
        >
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Type a command or search..."
          />

          <CommandList>
            <CommandEmpty>
              {searchQuery
                ? `No commands found for "${searchQuery}"`
                : 'No commands available'}
            </CommandEmpty>

            <CommandGroup heading="File Operations">
              {filteredFileCommands.map((cmd) => (
                <CommandItem
                  key={cmd.label}
                  value={cmd.label}
                  onSelect={() => handleSelect(cmd.label)}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="font-medium">{cmd.label}</div>
                    <div className="text-[11px] text-[color:var(--vscode-descriptionForeground)]">
                      {cmd.description}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Extension Commands">
              {filteredSampleCommands.map((cmd) => (
                <CommandItem
                  key={cmd.label}
                  value={cmd.label}
                  onSelect={() => handleSelect(cmd.label)}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="font-medium">{cmd.label}</div>
                    <div className="text-[11px] text-[color:var(--vscode-descriptionForeground)]">
                      {cmd.description}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}

      <div className="mt-5 px-4 py-3 rounded border-l-4 border-[color:var(--vscode-textBlockQuote-border)] bg-[color:var(--vscode-textBlockQuote-background)]">
        <h3 className="font-medium mb-2 text-[13px]">Test Information</h3>
        <p className="text-xs mb-1">
          <strong>Selected Value:</strong> {selectedValue || 'None'}
        </p>
        <p className="text-xs mb-2">
          <strong>Search Query:</strong> {searchQuery || 'None'}
        </p>
        <p className="text-xs mb-1">
          <strong>Components Tested:</strong>
        </p>
        <ul className="list-disc list-inside text-xs space-y-1">
          <li>Command (container)</li>
          <li>CommandInput (search input)</li>
          <li>CommandList (results)</li>
          <li>CommandItem (command entries with IPC wiring)</li>
          <li>CommandGroup (grouped sections)</li>
          <li>CommandSeparator</li>
          <li>CommandEmpty</li>
        </ul>
      </div>
    </div>
  );
}