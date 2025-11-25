<script lang="ts">
    import { appState } from '../store.svelte.ts';
    import { vscode } from '../lib/vscode.ts';
    import { START_INDEX_METHOD, LOAD_CONFIG_METHOD } from '../../protocol.ts';
    import SettingsIcon from 'lucide-svelte/icons/settings';
    import ChevronLeft from 'lucide-svelte/icons/chevron-left';

    // We use derived state from appState instead of local mocked loading
    let loading = $state(false); 

    async function refreshConfig() {
        loading = true;
        vscode.postMessage(LOAD_CONFIG_METHOD, {}, 'request');
        
        // Simple timeout to reset loading state since we don't have a direct promise ack here
        // In a perfect world, we'd use a request ID mapping.
        setTimeout(() => {
            loading = false;
        }, 1000);
    }

    function handleReindex() {
        vscode.postMessage(START_INDEX_METHOD, {}, 'command');
    }

    function handleOpenSettings() {
        vscode.postMessage('qdrant.openSettings', {}, 'command');
    }

    function goBack() {
        appState.setView('search');
    }

    // Attempt to load if missing on mount
    $effect(() => {
        if (!appState.config) {
             refreshConfig();
        }
    });
</script>

<div class="flex flex-col h-full w-full bg-background text-foreground">
    <!-- Header -->
    <div class="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="flex items-center gap-3 p-4">
            <button
                onclick={goBack}
                class="p-1 hover:bg-secondary/50 rounded transition-colors"
                title="Back to search"
            >
                <ChevronLeft class="w-5 h-5" />
            </button>
            <div class="flex items-center gap-2">
                <SettingsIcon class="w-5 h-5 text-primary" />
                <h2 class="text-sm font-semibold tracking-tight">Settings</h2>
            </div>
        </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto min-h-0 p-4">
        <div class="flex flex-col gap-6">
            <!-- Configuration Section -->
            <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-foreground/90">Configuration</h3>
                    <button onclick={refreshConfig} class="text-xs text-primary hover:underline">Refresh</button>
                </div>
                
                {#if loading && !appState.config}
                    <div class="text-xs text-muted-foreground">Loading configuration...</div>
                {:else if appState.config}
                    <div class="flex flex-col gap-2 text-xs text-muted-foreground bg-secondary/20 p-3 rounded border border-border/50">
                        <div><strong>Index Name:</strong> {appState.config.index_info?.name || 'Not configured'}</div>
                        <div><strong>Qdrant URL:</strong> {appState.config.qdrant_config?.url || 'Not configured'}</div>
                        <div><strong>Ollama Model:</strong> {appState.config.ollama_config?.model || 'Not configured'}</div>
                    </div>
                {:else}
                    <div class="text-xs text-muted-foreground bg-yellow-500/10 p-3 rounded border border-yellow-500/20">
                        No configuration loaded. Ensure <code>.qdrant/configuration.json</code> exists in your workspace.
                    </div>
                {/if}
            </div>

            <!-- Actions Section -->
            <div class="flex flex-col gap-3">
                <h3 class="text-sm font-semibold text-foreground/90">Actions</h3>
                
                <button
                    onclick={handleOpenSettings}
                    class="w-full px-3 py-2 bg-secondary/30 hover:bg-secondary/50 border border-border/50 rounded text-sm transition-colors text-left"
                >
                    Open Workspace Settings
                </button>

                <button
                    onclick={handleReindex}
                    disabled={appState.indexStatus === 'indexing'}
                    class="w-full px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded text-sm transition-colors disabled:cursor-not-allowed"
                >
                    {appState.indexStatus === 'indexing' ? 'Indexing...' : 'Force Re-index'}
                </button>
            </div>

            <!-- Status Section -->
            <div class="flex flex-col gap-3">
                <h3 class="text-sm font-semibold text-foreground/90">Status</h3>
                
                <div class="flex items-center gap-2 text-xs">
                    <span class={`w-2 h-2 rounded-full ${appState.indexStatus === 'ready' ? 'bg-green-500' : appState.indexStatus === 'indexing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
                    <span class="text-muted-foreground">
                        {appState.indexStatus === 'ready' ? 'Index Ready' : appState.indexStatus === 'indexing' ? 'Indexing in progress...' : 'Index Error'}
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>