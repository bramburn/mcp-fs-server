<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";
  import { setContext } from 'svelte';
  import { ipcContext, HostIpc } from '../../../contexts/ipc';

  type $$Props = HTMLAttributes<HTMLDivElement> & {
    loop?: boolean;
    value?: string;
    label?: string;
    isVisible?: boolean;
    class?: string; // Add class to $$Props for proper type inference
  };
  type $$Events = CommandEvents;

  let {
    class: className = undefined,
    loop = true,
    value = "",
    label = "",
    isVisible = true,
    ...rest // Collect other props
  } = $props<$$Props>();
  
  // Get the IPC context from parent
  const ipc: HostIpc = $state(null as any);
  
  // Optionally expose theme/style context
  $effect(() => {
    if (isVisible) {
      // Set context for child components
      setContext('commandRoot', { isVisible: true, theme: 'vscode' });
    }
  });
</script>

<CommandPrimitive
  bind:value
  {loop}
  {label}
  class={cn(
    "command-root",
    className
  )}
  role="combobox"
  aria-expanded={isVisible}
  aria-owns="command-list-id"
  {...rest}
  onopenchange
  onkeydown
  onchange
  oninput
  onfocus
  onblur
  onclick
>
  <slot />
</CommandPrimitive>

<style>
  .command-root {
    /* Use VS Code CSS custom properties for theming */
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    line-height: 1.4;
    
    /* Ensure proper focus management */
    &:focus-within {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
  }
</style>