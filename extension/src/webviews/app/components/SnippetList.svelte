<script lang="ts">
  import { appState } from '../store.svelte.ts';
  import { vscode } from '../lib/vscode.ts';
  import { OPEN_FILE_METHOD } from '../../protocol.ts';
  
  // Import shadcn Command components
  import CommandItem from '../components/ui/command/command-item.svelte';
  
  import FileCode from 'lucide-svelte/icons/file-code';
  import CornerDownRight from 'lucide-svelte/icons/corner-down-right';

  // Helper to open files
  function openFile(uri: string, line: number) {
    vscode.postMessage(OPEN_FILE_METHOD, { uri, line }, 'command');
  }

  let results = [];
  $: results = appState.results || [];
</script>

<div class="flex flex-col gap-1 w-full">
  {#each results as result, i (result.uri + '_' + result.lineStart + '_' + i)}
    <CommandItem
      class="flex flex-col text-left gap-1 p-3 rounded-md bg-secondary/20 hover:bg-secondary/40 border border-transparent hover:border-border transition-all cursor-pointer group data-[selected]:bg-secondary/50 data-[selected]:border-border outline-hidden"
      value={`${result.filePath}:${result.lineStart}`}
      onSelect={() => openFile(result.uri, result.lineStart)}
    >
      <!-- File Header -->
      <div class="flex items-center gap-2 w-full overflow-hidden">
        <FileCode class="w-4 h-4 text-primary shrink-0" />
        <span class="text-xs font-medium text-foreground truncate opacity-80 group-hover:opacity-100">
          {result.filePath || 'Unknown File'}
        </span>
        <span class="text-xs text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
          <CornerDownRight class="w-3 h-3" />
          {result.lineStart}
        </span>
      </div>

      <!-- Code Snippet -->
      <pre class="mt-1 text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto w-full font-mono text-muted-foreground group-hover:text-foreground transition-colors max-h-[200px] overflow-y-auto">
        <code>{result.snippet || ''}</code>
      </pre>
    </CommandItem>
  {/each}
</div>