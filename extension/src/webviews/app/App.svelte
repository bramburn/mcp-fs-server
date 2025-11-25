<script lang="ts">
    // P2.2: Main App and Routing
    import { onMount } from 'svelte';
    import { appState } from './store.svelte.ts';
    import Search from './views/Search.svelte';
    import Settings from './views/Settings.svelte';
    import { vscode } from './lib/vscode.ts';
    import { 
        SEARCH_METHOD, 
        INDEX_STATUS_METHOD, 
        LOAD_CONFIG_METHOD,
        CONFIG_DATA_METHOD,
        Scope
    } from '../protocol.ts';
    import type { 
        IpcMessage, 
        IpcNotification,
        SearchResponseParams, 
        IndexStatusParams, 
        QdrantOllamaConfig 
    } from '../protocol.ts';

    onMount(() => {
        // Initial Data Fetch
        vscode.postMessage(LOAD_CONFIG_METHOD, {}, 'request');

        // Listen for messages from the Extension Host
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as IpcMessage;

            // Security: Validate origin/scope
            if (message.scope !== Scope) return;

            // Fixed: Type guard to safely access params
            // We assume backend messages with payloads are Notifications for these methods
            if (message.kind === 'notification') {
                const notification = message as IpcNotification<any>;

                switch (message.method) {
                    case SEARCH_METHOD:
                        if (notification.params) {
                            const params = notification.params as SearchResponseParams;
                            appState.setResults(params.results || []);
                        }
                        break;
                    
                    case INDEX_STATUS_METHOD:
                        if (notification.params) {
                            const params = notification.params as IndexStatusParams;
                            appState.setIndexStatus(params.status);
                        }
                        break;
                    
                    case CONFIG_DATA_METHOD:
                        appState.setConfig(notification.params as QdrantOllamaConfig | null);
                        break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    });
</script>

<main class="h-screen w-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-primary/30">
    <!-- Simple Router Implementation -->
    {#if appState.view === 'search'}
        <Search />
    {:else if appState.view === 'settings'}
        <Settings />
    {:else}
        <div class="p-4">Unknown view</div>
    {/if}
</main>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }
</style>