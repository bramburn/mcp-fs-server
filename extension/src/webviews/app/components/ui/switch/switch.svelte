<script lang="ts">
  import { cn } from "../../../lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";
  // Assuming a primitive from svelte-radix or directly using input type="checkbox"
  // For simplicity, let's use a native input type checkbox for now
  // A proper Shadcn Svelte switch would likely involve a primitive from svelte-radix and a custom UI.

  type $$Props = HTMLAttributes<HTMLInputElement> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    class?: string;
    id?: string;
  };

  let {
    checked = false,
    onCheckedChange = undefined,
    disabled = false,
    class: className = undefined,
    id = undefined,
    ...rest
  } = $props<$$Props>();

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    checked = target.checked;
    onCheckedChange?.(checked);
  }
</script>

<input
  type="checkbox"
  role="switch"
  aria-checked={checked}
  {checked}
  {disabled}
  {id}
  class={cn(
    "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
    checked ? "bg-primary" : "bg-input",
    className
  )}
  onchange={handleChange}
  {...rest}
/>
