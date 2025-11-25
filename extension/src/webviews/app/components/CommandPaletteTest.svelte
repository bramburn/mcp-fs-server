<script lang="ts">
  import Command from './ui/command/command.svelte';
  import CommandInput from './ui/command/command-input.svelte';
  import CommandList from './ui/command/command-list.svelte';
  import CommandItem from './ui/command/command-item.svelte';
  import CommandGroup from './ui/command/command-group.svelte';
  import CommandSeparator from './ui/command/command-separator.svelte';
  import CommandEmpty from './ui/command/command-empty.svelte';
  import { getIpcContext } from '../contexts/ipc';
  import type { IpcScope } from '../../../protocol';

  let isVisible = $state(true);
  let searchQuery = $state('');
  let selectedValue = $state('');

  // Sample command data for testing
  const sampleCommands = [
    {
      label: 'Open File',
      description: 'Open a file in the editor',
      action: {
        command: 'file/open',
        params: { uri: 'file:///example.txt', line: 1 },
        scope: 'qdrantIndex' as IpcScope
      }
    },
    {
      label: 'Search',
      description: 'Search for files',
      action: {
        command: 'search',
        params: { query: 'test' },
        scope: 'qdrantIndex' as IpcScope
      }
    },
    {
      label: 'Settings',
      description: 'Open extension settings',
      action: {
        command: 'webview/execute-command',
        params: { command: 'workbench.action.openSettings', args: ['mcpFsServer'] },
        scope: 'webview-mgmt' as IpcScope
      }
    }
  ];

  const fileCommands = [
    {
      label: 'New File',
      description: 'Create a new file',
      action: {
        command: 'webview/execute-command',
        params: { command: 'workbench.action.files.newUntitledFile' },
        scope: 'webview-mgmt' as IpcScope
      }
    },
    {
      label: 'Save File',
      description: 'Save the current file',
      action: {
        command: 'webview/execute-command',
        params: { command: 'workbench.action.files.save' },
        scope: 'webview-mgmt' as IpcScope
      }
    }
  ];

  function handleCommandSelect(value: string) {
    selectedValue = value;
    console.log('Command selected:', value);
  }

  function toggleVisibility() {
    isVisible = !isVisible;
  }

  // Test IPC context availability
  let ipcAvailable = $state(false);
  try {
    const ipc = getIpcContext();
    ipcAvailable = true;
  } catch (error) {
    console.warn('IPC context not available:', error);
  }
</script>

<div class="test-container">
  <h2>Command Palette Component Test</h2>
  
  <div class="test-controls">
    <button onclick={toggleVisibility}>
      {isVisible ? 'Hide' : 'Show'} Command Palette
    </button>
    <div class="status">
      IPC Context: {ipcAvailable ? '✅ Available' : '❌ Not Available'}
    </div>
  </div>

  {#if isVisible}
    <Command bind:value={selectedValue} isVisible={isVisible} on:change={(e) => handleCommandSelect(e.detail)}>
      <CommandInput bind:query={searchQuery} placeholder="Type a command or search..." />
      
      <CommandList>
        <CommandEmpty bind:query={searchQuery} />
        
        <CommandGroup heading="File Operations">
          {#each fileCommands as cmd}
            <CommandItem 
              value={cmd.label} 
              action={cmd.action}
              onclick={() => console.log('Clicked:', cmd.label)}
            >
              <div class="command-content">
                <div class="command-label">{cmd.label}</div>
                <div class="command-description">{cmd.description}</div>
              </div>
            </CommandItem>
          {/each}
        </CommandGroup>
        
        <CommandSeparator />
        
        <CommandGroup heading="Extension Commands">
          {#each sampleCommands as cmd}
            <CommandItem 
              value={cmd.label} 
              action={cmd.action}
              onclick={() => console.log('Clicked:', cmd.label)}
            >
              <div class="command-content">
                <div class="command-label">{cmd.label}</div>
                <div class="command-description">{cmd.description}</div>
              </div>
            </CommandItem>
          {/each}
        </CommandGroup>
      </CommandList>
    </Command>
  {/if}

  <div class="test-info">
    <h3>Test Information</h3>
    <p><strong>Selected Value:</strong> {selectedValue || 'None'}</p>
    <p><strong>Search Query:</strong> {searchQuery || 'None'}</p>
    <p><strong>Components Tested:</strong></p>
    <ul>
      <li>✅ Command (with VS Code theming and accessibility)</li>
      <li>✅ CommandInput (with aria attributes)</li>
      <li>✅ CommandList (with listbox role and VS Code theming)</li>
      <li>✅ CommandItem (with IPC integration)</li>
      <li>✅ CommandGroup (with group role and aria-labelledby)</li>
      <li>✅ CommandSeparator (with VS Code theming)</li>
      <li>✅ CommandEmpty (with VS Code theming)</li>
    </ul>
  </div>
</div>

<style>
  .test-container {
    padding: 20px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    min-height: 100vh;
  }

  h2, h3 {
    color: var(--vscode-foreground);
    margin-top: 0;
  }

  .test-controls {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 20px;
  }

  .test-controls button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }

  .test-controls button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }

  .status {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .command-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .command-label {
    font-weight: 500;
    color: var(--vscode-list-foreground);
  }

  .command-description {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .test-info {
    margin-top: 20px;
    padding: 16px;
    background-color: var(--vscode-textBlockQuote-background);
    border-left: 4px solid var(--vscode-textBlockQuote-border);
    border-radius: 4px;
  }

  .test-info ul {
    margin: 8px 0;
    padding-left: 20px;
  }

  .test-info li {
    margin: 4px 0;
    font-size: 12px;
  }
</style>