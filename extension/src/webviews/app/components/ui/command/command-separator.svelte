<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement> & {
    class?: string; // Add class to $$Props for proper type inference
  };

  let {
    class: className = undefined,
    ...rest // Collect other props
  } = $props<$$Props>();
</script>

<CommandPrimitive.Separator
  class={cn("command-separator", className)}
  role="separator"
  aria-hidden="true"
  {...rest}
/>

<style>
  .command-separator {
    margin: 4px 8px;
    height: 1px;
    background-color: var(--vscode-list-separatorForeground);
    border: none;
  }
</style>