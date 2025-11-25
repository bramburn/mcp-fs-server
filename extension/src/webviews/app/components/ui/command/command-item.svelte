<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandItemEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement>;

  type $$Events = CommandItemEvents;

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let value: string = "";
</script>

<CommandPrimitive.Item
  bind:value
  class={cn(
    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50",
    className
  )}
  {...$$restProps}
  on:click
  on:keydown
  on:focus
  on:blur
/>
