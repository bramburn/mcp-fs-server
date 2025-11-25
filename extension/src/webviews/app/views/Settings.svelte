<script lang="ts">
    import { sendCommand, sendRequest, onNotification } from '../lib/vscode'; // Use new IPC functions
    import { LOAD_CONFIG_METHOD, START_INDEX_METHOD, CONFIG_DATA_METHOD, DID_CHANGE_CONFIG_NOTIFICATION } from '../../protocol';
    import type { QdrantOllamaConfig } from '../../protocol';
    // import type { OverviewFilters } from "$lib/types"; // Assume this type exists if needed for further logic
    import Button from '../components/ui/button/button.svelte';
    import SettingsIcon from 'lucide-svelte/icons/settings';
    import ChevronLeft from 'lucide-svelte/icons/chevron-left';
    import Switch from "$app/components/ui/switch/switch.svelte"; // Required for settings UI (updated alias)

    // Mock appState for UI elements that rely on it (indexStatus, config, setView)
    let appState = $state({
        config: undefined as QdrantOllamaConfig | undefined,
        indexStatus: 'ready' as 'ready' | 'indexing' | 'error',
        setView: (view: string) => console.log('setView called:', view)
    });

    let loading = $state(false);

    // Initialize state from mock appState config if available
    // let initialFilters = $state<OverviewFilters | undefined>(appState.config); // No direct equivalent in protocol.ts
    let showStale = $state(false); // Default to false, assuming this is a local setting

    async function refreshConfig() {
        loading = true;
        // Assuming LOAD_CONFIG_METHOD is a request that returns QdrantOllamaConfig
        sendRequest<{}, QdrantOllamaConfig>(LOAD_CONFIG_METHOD, 'qdrantIndex', {})
            .then(config => {
                appState.config = config;
            })
            .catch(error => {
                console.error('Failed to load config:', error);
                appState.config = undefined; // Clear config on error
            })
            .finally(() => {
                loading = false;
            });
    }

    function handleReindex() {
        sendCommand(START_INDEX_METHOD, 'qdrantIndex', {});
    }

    function handleOpenSettings() {
        // Assuming 'qdrant.openSettings' is a VS Code command to be executed by the extension host
        sendCommand('webview/execute-command', 'webview-mgmt', { command: 'qdrant.openSettings' });
    }

    function goBack() {
        appState.setView('search');
    }

    // Initialize on mount (mimicking onMount behavior with $effect.pre)
    $effect.pre(() => {
        if (!appState.config) {
             refreshConfig();
        }
        // Listen for config updates from the extension host
        onNotification<QdrantOllamaConfig>(CONFIG_DATA_METHOD, (config) => {
            appState.config = config;
        });

        // Listen for configuration changes (e.g., from preferences)
        onNotification<{ configKey: string, value: any }>(DID_CHANGE_CONFIG_NOTIFICATION, (params) => {
            if (params.configKey === 'overview.stale.show') {
                showStale = params.value;
            }
            // Add more handling for other config keys if needed
        });
    });

    // Effect to watch local state changes and send IPC updates
    $effect(() => {
        // This assumes 'overview.stale.show' is a preference that can be updated
        // via a command to the extension host.
        // There's no direct 'UpdatePreferencesCommand' in protocol.ts, so I'll create a generic one.
        sendCommand('update/preferences', 'webview-mgmt', { 'overview.stale.show': showStale });
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

            <!-- Settings Mirror for Stale Filter -->
            <div class="flex flex-col gap-3">
                <h3 class="text-sm font-semibold text-foreground/90">Filters</h3>
                <div class="flex items-center justify-between p-2 border rounded">
                    <label for="stale-filter" class="text-sm">Show Stale Results</label>
                    <Switch id="stale-filter" bind:checked={showStale} />
                </div>
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