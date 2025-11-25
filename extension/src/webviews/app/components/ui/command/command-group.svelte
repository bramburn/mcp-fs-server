<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { CommandGroupEvents } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement>;

  type $$Events = CommandGroupEvents;

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let heading: string | undefined = undefined;
</script>

<CommandPrimitive.Group
  {heading}
  class={cn(
    "overflow-hidden p-1 text-foreground [&_[data-cmdk-group-heading]]:px-2 [&_[data-cmdk-group-heading]]:py-1.5 [&_[data-cmdk-group-heading]]:text-xs [&_[data-cmdk-group-heading]]:font-medium [&_[data-cmdk-group-heading]]:text-muted-foreground",
    className
  )}
  {...$$restProps}
  on:keydown
/>
