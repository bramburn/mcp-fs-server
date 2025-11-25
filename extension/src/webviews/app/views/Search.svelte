<script lang="ts">
  // P2.3: Design Search Interface with shadcn/ui
  import { appState } from '../store.svelte.ts';
  import { vscode } from '../lib/vscode.ts';
  import SnippetList from '../components/SnippetList.svelte';
  import { SEARCH_METHOD, START_INDEX_METHOD } from '../../protocol.ts';
  
  // Import shadcn components
  import Command from '../components/ui/command/command.svelte';
  import CommandInput from '../components/ui/command/command-input.svelte';
  import CommandList from '../components/ui/command/command-list.svelte';
  import CommandEmpty from '../components/ui/command/command-empty.svelte';
  import { Button } from '../components/ui/button/button.svelte';

  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleSearch() {
    const value = appState.query;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (value.trim().length > 2) {
        appState.isSearching = true;
        vscode.postMessage(SEARCH_METHOD, { query: value }, 'request');
      }
    }, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  function handleIndex() {
    vscode.postMessage(START_INDEX_METHOD, {}, 'command');
  }

  function openSettings() {
    appState.setView('settings');
  }
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-background">
  <!-- Header / Search Bar -->
  <div class="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold tracking-tight text-foreground/80">
          Semantic Code Search
        </h2>
        <Button variant="link" size="sm" on:click={openSettings} class="text-xs">
          Settings
        </Button>
      </div>

      <!-- shadcn Command Component Structure -->
      <Command>
        <CommandInput
          bind:value={appState.query}
          onkeydown={handleKeydown}
          oninput={handleSearch}
          placeholder="Search codebase..."
        />
        <CommandList class="max-h-[300px] overflow-y-auto">
          <CommandEmpty>No results found. Try indexing your workspace or changing your query.</CommandEmpty>
          <SnippetList />
        </CommandList>
      </Command>

      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${appState.indexStatus === 'ready' ? 'bg-green-500' : appState.indexStatus === 'indexing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span>{appState.indexStatus === 'indexing' ? 'Indexing...' : 'Index Ready'}</span>
        </div>

        <Button 
          on:click={handleIndex}
          disabled={appState.indexStatus === 'indexing'}
          size="sm"
          variant="default"
        >
          {appState.indexStatus === 'indexing' ? 'Indexing...' : 'Re-Index'}
        </Button>
      </div>
    </div>
  </div>

  <!-- Results Area -->
  <div class="flex-1 overflow-y-auto min-h-0">
    <SnippetList />
  </div>
</div>