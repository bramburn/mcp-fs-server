<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils.js";

  type $$Props = HTMLAttributes<HTMLInputElement>;

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let value: string = "";
  export let type: $$Props["type"] = "text";
  export let placeholder: $$Props["placeholder"] = undefined;
</script>

<input
  bind:value
  {type}
  {placeholder}
  class={cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  {...$$restProps}
/>
