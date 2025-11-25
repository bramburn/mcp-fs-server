<script lang="ts">
  import { cn } from "../../../lib/utils.js";

  type $$Props = {
    class?: string;
  };

  let { class: className = undefined } = $props<$$Props>();
</script>

<div class={cn("command-loading", className)}>
  <div class="loading-spinner">
    <div class="spinner"></div>
    <span>Loading...</span>
  </div>
</div>

<style>
  .command-loading {
    padding: 24px 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }

  .loading-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: var(--vscode-focusBorder);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

