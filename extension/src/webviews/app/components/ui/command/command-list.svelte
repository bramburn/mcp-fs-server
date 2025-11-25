<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandListEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement>;

  type $$Events = CommandListEvents;

  let className: $$Props["class"] = undefined;
  export { className as class };
</script>

<CommandPrimitive.List
  class={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
  {...$$restProps}
  on:scroll
  on:keydown
  on:focus
  on:blur
/>
