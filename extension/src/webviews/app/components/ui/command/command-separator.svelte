<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLDivElement>;

  let className: $$Props["class"] = undefined;
  export { className as class };
</script>

<CommandPrimitive.Separator
  class={cn("-mx-1 h-px bg-border", className)}
  {...$$restProps}
/>
