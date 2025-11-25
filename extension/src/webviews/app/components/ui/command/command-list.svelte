<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandListEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement> & {
    class?: string; // Add class to $$Props for proper type inference
  };
  type $$Events = CommandListEvents;

  let {
    class: className = undefined,
    ...rest // Collect other props
  } = $props<$$Props>();
</script>

<CommandPrimitive.List
  class={cn("command-list", className)}
  role="listbox"
  id="command-list-id"
  {...rest}
  onscroll
  onkeydown
  onfocus
  onblur
/>

<style>
  .command-list {
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    
    /* Use VS Code theming */
    background-color: var(--vscode-list-background);
    color: var(--vscode-list-foreground);
    
    /* VS Code scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: var(--vscode-scrollbarSlider-background) var(--vscode-editor-background);
  }
  
  /* Webkit scrollbar styling for Chrome/Safari */
  .command-list::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  .command-list::-webkit-scrollbar-track {
    background: var(--vscode-editor-background);
  }
  
  .command-list::-webkit-scrollbar-thumb {
    background-color: var(--vscode-scrollbarSlider-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-scrollbarSlider-background);
  }
  
  .command-list::-webkit-scrollbar-thumb:hover {
    background-color: var(--vscode-scrollbarSlider-hoverBackground);
  }
  
  .command-list::-webkit-scrollbar-thumb:active {
    background-color: var(--vscode-scrollbarSlider-activeBackground);
  }
</style>