<script lang="ts">
  import { Command as CommandPrimitive } from "cmdk-sv";
  import type { HTMLAttributes } from "svelte/elements"; // Import HTMLAttributes
  
  type $$Props = HTMLAttributes<HTMLDivElement> & {
    query?: string;
  };

  let {
    query = "",
    ...rest // Collect other props
  } = $props<$$Props>();
</script>

<CommandPrimitive.Empty class="command-empty-state" {...rest}>
  <div class="command-empty-content">
    <div class="command-empty-title">No results found.</div>
    {#if query}
      <p class="command-empty-subtitle">Try refining your search for "{query}".</p>
    {/if}
  </div>
</CommandPrimitive.Empty>

<style>
  .command-empty-state {
    padding: 24px 16px;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
  }
  
  .command-empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  
  .command-empty-title {
    color: var(--vscode-foreground);
    font-weight: 500;
  }
  
  .command-empty-subtitle {
    color: var(--vscode-descriptionForeground);
    margin: 0;
    font-size: 12px;
  }
</style>