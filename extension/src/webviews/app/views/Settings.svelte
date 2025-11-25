<script lang="ts">
    import { onMount } from 'svelte';
    import { appState } from '../store.svelte.ts';
    import { vscode } from '../lib/vscode.ts';
    import { START_INDEX_METHOD, LOAD_CONFIG_METHOD } from '../../protocol.ts';
    
    // Import shadcn components
    import { Button } from '../components/ui/button/button.svelte';
    import SettingsIcon from 'lucide-svelte/icons/settings';
    import ChevronLeft from 'lucide-svelte/icons/chevron-left';

    let loading = false; 

    async function refreshConfig() {
        loading = true;
        vscode.postMessage(LOAD_CONFIG_METHOD, {}, 'request');
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

    onMount(() => {
        if (!appState.config) {
             refreshConfig();
        }
    });
</script>

<div class="flex flex-col h-full w-full bg-background text-foreground">
    <!-- Header -->
    <div class="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="flex items-center gap-3 p-4">
            <Button variant="ghost" size="icon" on:click={goBack} class="p-1" title="Back to search">
                <ChevronLeft class="w-5 h-5" />
            </Button>
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
                    <Button variant="link" size="sm" on:click={refreshConfig} class="text-xs p-0 h-auto">
                        Refresh
                    </Button>
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
                
                <Button variant="outline" on:click={handleOpenSettings} class="w-full justify-start">
                    Open Workspace Settings
                </Button>

                <Button 
                    on:click={handleReindex}
                    disabled={appState.indexStatus === 'indexing'}
                    class="w-full"
                >
                    {appState.indexStatus === 'indexing' ? 'Indexing...' : 'Force Re-index'}
                </Button>
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