<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandItemEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";
  import { getContext } from 'svelte';
  import { getIpcContext } from '../../../contexts/ipc';
  import type { IpcScope } from '../../../../../protocol';

  type $$Props = HTMLAttributes<HTMLDivElement> & {
    value?: string;
    action?: ActionCommand;
    isSelected?: boolean;
    class?: string; // Add class to $$Props for proper type inference
  };
  type $$Events = CommandItemEvents;

  // Define ActionCommand interface for command execution
  export interface ActionCommand {
    command: string;
    params?: any;
    scope?: IpcScope;
  }

  let {
    class: className = undefined,
    value = "",
    action = undefined,
    isSelected = false,
    ...rest // Collect other props
  } = $props<$$Props>();
  
  // Get IPC context for command execution
  let ipc: ReturnType<typeof getIpcContext> | null = null;
  
  try {
    ipc = getIpcContext();
  } catch (error) {
    console.warn('IPC context not available in command-item');
  }

  function executeAction() {
    if (action && ipc) {
      // Use standard IPC send mechanism
      const scope = action.scope || 'webview-mgmt';
      ipc.sendCommand(action.command, scope, action.params || {});
    }
  }

  function handleClick(event: MouseEvent) {
    if (action) {
      executeAction();
    }
  }
</script>

<CommandPrimitive.Item
  bind:value
  class={cn(
    "command-item",
    isSelected && "command-item-selected",
    className
  )}
  role="option"
  tabindex="0"
  aria-selected={isSelected}
  onclick={handleClick}
  onkeydown
  onfocus
  onblur
  {...rest}
>
  {@render $$slots.default()}
</CommandPrimitive.Item>

<style>
  .command-item {
    position: relative;
    display: flex;
    cursor: default;
    user-select: none;
    align-items: center;
    padding: 6px 8px;
    font-size: 13px;
    line-height: 1.4;
    outline: none;
    border-radius: 2px;
    margin: 1px 4px;
    color: var(--vscode-list-foreground);
    background-color: transparent;
    transition: background-color 0.1s ease;
  }
  
  .command-item:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
  
  .command-item.command-item-selected {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  
  .command-item:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  
  .command-item:disabled {
    pointer-events: none;
    opacity: 0.5;
  }
</style>