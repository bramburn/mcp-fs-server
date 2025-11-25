<script lang="ts">
    // P2.2: Main App and Routing
    import { onMount } from 'svelte';
    import appState from './store.svelte.ts';
    import Search from './views/Search.svelte';
    import Settings from './views/Settings.svelte';
    import CommandPaletteTest from './components/CommandPaletteTest.svelte';
    import { hostIpc } from './lib/vscode.ts';
    import { setIpcContext } from './contexts/ipc';
    import {
        SEARCH_METHOD,
        INDEX_STATUS_METHOD,
        LOAD_CONFIG_METHOD,
        CONFIG_DATA_METHOD
    } from '../protocol.ts';
    import type {
        IpcMessage,
        IpcNotification,
        SearchResponseParams,
        IndexStatusParams,
        QdrantOllamaConfig
    } from '../protocol.ts';

    onMount(() => {
        // Set up IPC context for all child components
        setIpcContext(hostIpc);
        
        // Initial Data Fetch
        hostIpc.sendRequest(LOAD_CONFIG_METHOD, 'webview-mgmt', {});

        // Listen for messages from the Extension Host
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as IpcMessage;

            // Security: Validate origin/scope
            if (message.scope !== 'webview-mgmt') return;

            // Fixed: Type guard to safely access params
            // We assume backend messages with payloads are Notifications for these methods
            if (message.kind === 'notification') {
                const notification = message as IpcNotification<any>;

                switch (message.method) {
                    case SEARCH_METHOD:
                        if (notification.params) {
                            const params = notification.params as SearchResponseParams;
                            appState.searchResults = params.results || [];
                        }
                        break;

                    case INDEX_STATUS_METHOD:
                        if (notification.params) {
                            const params = notification.params as IndexStatusParams;
                            appState.indexStatus = params.status;
                            if (params.progress !== undefined) {
                                appState.indexProgress = params.progress;
                            }
                        }
                        break;

                    case CONFIG_DATA_METHOD:
                        appState.config = (notification.params as QdrantOllamaConfig | null) || undefined;
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
    {:else if appState.view === 'test'}
        <CommandPaletteTest />
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