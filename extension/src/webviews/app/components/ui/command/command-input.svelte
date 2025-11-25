<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandInputEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";
  import Input from '../input/input.svelte';

  type $$Props = HTMLAttributes<HTMLInputElement> & {
    value?: string;
    placeholder?: string;
    query?: string;
    class?: string;
  };
  type $$Events = CommandInputEvents;

  let {
    class: className = undefined,
    value = "",
    placeholder = "Type a command...",
    query = "",
    ...rest // Collect other props
  } = $props<$$Props>();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    query = target.value;
    value = target.value; // Keep this if 'value' is expected to be updated for external binding
  }

  function handleFocus() {
    console.log('Command input focused - Ready to send WebviewFocusChangedCommand if needed');
  }
</script>

<div class="command-input-wrapper" data-cmdk-input-wrapper="">
  <Input
    bind:value={query}
    type="text"
    {placeholder}
    class={cn(
      "command-input",
      className
    )}
    aria-autocomplete="list"
    aria-controls="command-list-id"
    oninput={handleInput}
    onfocus={handleFocus}
    onkeydown
    onkeypress
    onblur
    onclick
    {...rest}
  />
</div>

<style>
  .command-input-wrapper {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 0 8px;
    background-color: var(--vscode-editor-background);
  }
  
  .command-input {
    flex: 1;
    height: 40px;
    background-color: transparent;
    border: none;
    padding: 8px 0;
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-font-family);
    font-size: 13px;
    outline: none;
  }
  
  .command-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
</style>