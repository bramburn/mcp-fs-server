<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import { cn } from "../../../lib/utils.js";

  let {
    class: className = undefined,
    loop = true,
    value = "",
    label = "",
    isVisible = true,
    ...rest
  } = $props();
</script>

<CommandPrimitive.Root
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
>
  <slot />
</CommandPrimitive.Root>

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