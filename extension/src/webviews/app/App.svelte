<script lang="ts">
    import { onMount } from 'svelte';
    import { appState } from './store.svelte';
    import Search from './views/Search.svelte';
    import { SEARCH_METHOD, INDEX_STATUS_METHOD } from '../protocol';
    import type { IpcMessage, SearchResponseParams, IndexStatusParams } from '../protocol';

    onMount(() => {
        // Listen for messages from the Extension Host
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as IpcMessage;

            // Optional: Check scope if needed
            // if (message.scope !== 'qdrantIndex') return;

            switch (message.method) {
                case SEARCH_METHOD:
                    // Assuming host sends back a 'response' or notification with same method for simplicity in P2
                    // In strict protocol, this might be a separate response ID match
                    if (message.kind === 'response' || message.kind === 'notification') {
                        const params = message.params as SearchResponseParams;
                        appState.setResults(params.results);
                    }
                    break;
                
                case INDEX_STATUS_METHOD:
                    const statusParams = message.params as IndexStatusParams;
                    appState.setIndexStatus(statusParams.status);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    });
</script>

<main class="h-screen w-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-primary/30">
    {#if appState.view === 'search'}
        <Search />
    {:else}
        <div class="p-4">Settings View (Coming Soon)</div>
    {/if}
</main>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }
</style>