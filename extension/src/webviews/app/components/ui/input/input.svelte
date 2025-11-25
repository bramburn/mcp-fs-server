<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLInputElement>;

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let value: string = "";
  export let inputType: string = "text";
  export let placeholder: string = "";
  export let disabled: boolean = false;

  function handleFocus() {
    console.log('Input focused - Ready to send WebviewFocusChangedCommand if needed');
  }
</script>

<input
  bind:value
  type={inputType}
  {placeholder}
  {disabled}
  class={cn(
    "vscode-input",
    className
  )}
  on:focus={handleFocus}
  {...$$restProps}
/>

<style>
  .vscode-input {
    color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 8px;
    border-radius: 2px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    line-height: 1.4;
    outline: none;
    transition: border-color 0.1s ease;
  }
  
  .vscode-input:focus {
    border-color: var(--vscode-focusBorder);
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  
  .vscode-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
  
  .vscode-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .vscode-input::selection {
    background-color: var(--vscode-input-selectionBackground);
    color: var(--vscode-input-selectionForeground);
  }
</style>
