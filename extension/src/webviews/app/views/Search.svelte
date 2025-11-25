<script lang="ts">
    // P2.3: Design Search Interface with Bits UI
    import { appState } from '../store.svelte.ts';
    import { vscode } from '../lib/vscode.ts';
    import SnippetList from '../components/SnippetList.svelte';
    import { SEARCH_METHOD, START_INDEX_METHOD } from '../../protocol.ts';
    import { Command } from 'bits-ui'; // Fixed bits-ui import

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
                <button onclick={openSettings} class="text-xs text-primary hover:underline">
                    Settings
                </button>
            </div>

            <!-- Bits UI Command Input Structure -->
            <Command.Root>
                <div class="relative">
                    <Command.Input
                        bind:value={appState.query}
                        onkeydown={handleKeydown}
                        oninput={handleSearch}
                        placeholder="Search codebase..."
                        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>
            </Command.Root>

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
        {#if appState.results.length === 0 && !appState.isSearching}
            <div class="text-center text-muted-foreground text-sm py-8 opacity-60">
                No results found. Try indexing your workspace or changing your query.
            </div>
        {/if}
        <SnippetList />
    </div>
</div>