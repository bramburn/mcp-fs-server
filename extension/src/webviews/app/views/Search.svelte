<script lang="ts">
    import { appState } from '../store.svelte';
    import { vscode } from '../lib/vscode';
    import SnippetList from '../components/SnippetList.svelte';
    import { SEARCH_METHOD, START_INDEX_METHOD } from '../../protocol';

    let debounceTimer: ReturnType<typeof setTimeout>;

    function handleSearch(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        appState.query = value;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (value.trim().length > 2) {
                appState.isSearching = true;
                vscode.postMessage(SEARCH_METHOD, { query: value }, 'request');
            }
        }, 300);
    }

    function handleIndex() {
        vscode.postMessage(START_INDEX_METHOD, {}, 'command');
    }
</script>

<div class="flex flex-col h-full w-full bg-background text-foreground">
    <!-- Header / Search Bar -->
    <div class="sticky top-0 z-10 p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold tracking-tight text-foreground/80">
                Semantic Code Search
            </h2>
            
            <div class="relative">
                <input
                    type="text"
                    placeholder="Search codebase..."
                    class="w-full h-9 px-3 py-1 text-sm bg-secondary/30 border border-input rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground/70"
                    value={appState.query}
                    oninput={handleSearch}
                />
            </div>

            <div class="flex items-center justify-between text-xs text-muted-foreground">
                <div class="flex items-center gap-2">
                    <span class={`w-2 h-2 rounded-full ${appState.indexStatus === 'ready' ? 'bg-green-500' : appState.indexStatus === 'indexing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
                    <span>{appState.indexStatus === 'indexing' ? 'Indexing...' : 'Index Ready'}</span>
                </div>
                
                <button 
                    onclick={handleIndex}
                    disabled={appState.indexStatus === 'indexing'}
                    class="px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    Re-Index
                </button>
            </div>
        </div>
    </div>

    <!-- Results Area -->
    <div class="flex-1 overflow-y-auto min-h-0">
        <SnippetList />
    </div>
</div>