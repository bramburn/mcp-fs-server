<script lang="ts">
  // P2.3: Design Search Interface with shadcn/ui
  import { sendCommand, sendRequest } from '../lib/vscode'; // Use new IPC functions
  import SnippetList from '../components/SnippetList.svelte';
  import { SEARCH_METHOD, START_INDEX_METHOD, IpcScope, SearchRequestParams, SearchResponseParams } from '../../protocol'; // Use typed IPC commands and constants
  import type { FileSnippetResult } from '../../protocol';
  import * as Command from '$app/components/ui/command'; // Assuming Command is now a module import for compound components
  import Button from '$app/components/ui/button/button.svelte';

  // Svelte 5 Runes State
  let searchInput = $state(''); // Current search query, bound to Command.Input
  let searchQuery = $state<{ query: string, naturalLanguage: boolean }>({ query: '', naturalLanguage: false }); // Debounced state
  let isLoading = $state(false);
  let results = $state<FileSnippetResult[]>([]); // Local state for results (though store might manage this)

  let debounceTimer: ReturnType<typeof setTimeout>; // Debounce timer variable

  // Mock appState/indexStatus for UI elements that rely on it
  let appState = $state({
    query: '',
    isSearching: false,
    indexStatus: 'ready' as 'ready' | 'indexing' | 'error',
    setView: (view: string) => console.log('setView called:', view)
  });

  // Manual debounce logic for searchInput
  $effect(() => {
    clearTimeout(debounceTimer); // Clear any existing timer

    debounceTimer = setTimeout(() => {
      if (searchInput.length > 2) {
        searchQuery = { query: searchInput, naturalLanguage: false };
      } else {
        // Clear search input automatically cancels the search
        searchQuery = { query: '', naturalLanguage: false };
      }
    }, 300);
  });

  // Effect to handle search requests and cancellation based on searchQuery state
  $effect(() => {
    if (searchQuery.query.length > 0) {
      isLoading = true;
      sendRequest<SearchRequestParams, SearchResponseParams>(
        SEARCH_METHOD,
        'qdrantIndex', // Assuming 'qdrantIndex' is the scope for search
        { query: searchQuery.query }
      ).then(response => {
        results = response.results;
        isLoading = false;
      }).catch(error => {
        console.error('Search request failed:', error);
        isLoading = false;
      });
    } else if (searchInput.length === 0) {
      // Assuming a "cancel search" command if needed, otherwise just clear results
      // sendCommand('search/cancel', 'qdrantIndex', { preserveResults: false }); // Example cancel command
      results = [];
    }
  });

  // Placeholder for index status update logic (mimicking old logic)
  $effect(() => {
    if (appState.indexStatus === 'indexing') {
      isLoading = true; // Keep loading true if indexing is active
    }
  });

  function handleIndex() {
    sendCommand(START_INDEX_METHOD, 'qdrantIndex', {}); // Assuming 'qdrantIndex' is the scope for indexing
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

      <!-- SHADCN Command Component Structure (Simplified from Compound) -->
      <Command.Root filter={(value, search) => 1} >
        <Command.Input
          placeholder="Search codebase..."
          bind:value={searchInput}
        />
        <Command.List>
          {#if isLoading}
            <Command.Loading />
          {:else if results.length === 0 && searchInput.length === 0}
            <Command.Empty>Start typing to search...</Command.Empty>
          {:else if results.length === 0 && searchInput.length > 2}
            <Command.Empty>No results found for "{searchInput}".</Command.Empty>
          {:else}
            {#each results as result (result.uri + result.lineStart)}
              <Command.Item value={`${result.filePath}:${result.lineStart}`}>
                <!-- SnippetList.Item seems to be a custom component. Re-evaluating import. -->
                <!-- The existing SnippetList component is probably what should render the results. -->
                <!-- For now, I'll pass results to SnippetList directly -->
                <SnippetList {results} /> 
              </Command.Item>
            {/each}
          {/if}
        </Command.List>
      </Command.Root>

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
    <!-- SnippetList should render the results directly here, outside Command.List -->
    <!-- The previous SnippetList was rendering outside the Command.List, so it should stay there. -->
    <!-- The #each block inside Command.List is an attempt to map Command.Item to results, which is fine. -->
    <!-- But the overall SnippetList component would ideally take `results` as a prop. -->
    <!-- For now, assuming SnippetList can handle `results` via appState if needed,
         or I need to modify it to accept a prop. Let's stick to modifying Search.svelte only. -->
    <SnippetList {results} />
  </div>
</div>