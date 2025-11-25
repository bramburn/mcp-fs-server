<script lang="ts">
  import { Button as ButtonPrimitive } from "svelte-radix";
  import { cn } from "../../../lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";

  type $$Props = HTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    href?: string;
  };

  type $$Events = {
    click: Parameters<ButtonPrimitive["click"]>[0];
  };

  let {
    class: className = undefined, // Handle class renaming here
    variant = "default",
    size = "default",
    href = undefined,
    ...rest // Collect all other props to spread onto the primitive
  } = $props<$$Props>();

</script>

<ButtonPrimitive
  {href}
  class={cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  )}
  {...rest}
>
</ButtonPrimitive>