<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandGroupEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement> & {
    heading?: string;
    class?: string; // Add class to $$Props for proper type inference
  };
  type $$Events = CommandGroupEvents;

  let {
    class: className = undefined,
    heading = undefined,
    ...rest // Collect other props
  } = $props<$$Props>();
  
  // Generate a unique ID for the heading label
  let headingId: string = $state("");
  
  $effect(() => {
    if (heading) {
      headingId = `${heading.toLowerCase().replace(/\s+/g, '-')}-label`;
    }
  });
</script>

<CommandPrimitive.Group
  {heading}
  class={cn(
    "command-group",
    className
  )}
  role="group"
  aria-labelledby={headingId}
  {...rest}
  onkeydown
>
  {#if heading}
    <div id={headingId} class="command-group-heading">{heading}</div>
  {/if}
  {@render $$slots.default()}
</CommandPrimitive.Group>

<style>
  .command-group {
    overflow: hidden;
    padding: 4px;
  }
  
  .command-group-heading {
    padding: 6px 8px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 4px 0;
    user-select: none;
  }
  
  /* Ensure group items are properly styled */
  :global(.command-group > .command-item) {
    margin-left: 8px;
    margin-right: 8px;
  }
</style>