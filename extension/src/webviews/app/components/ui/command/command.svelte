<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement>;
  type $$Events = CommandEvents;

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let loop = true;

  export let value: string = "";
  export let label: string = "";
</script>

<CommandPrimitive
  bind:value
  {loop}
  {label}
  class={cn(
    "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
    className
  )}
  {...$$restProps}
  on:openChange
  on:keydown
  on:change
  on:input
  on:focus
  on:blur
  on:click
/>
