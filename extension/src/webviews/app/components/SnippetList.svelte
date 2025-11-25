<script lang="ts">
    import { appState } from '../store.svelte';
    import { vscode } from '../lib/vscode';

    // Helper to open files
    function openFile(uri: string, line: number) {
        // In a real implementation, we send a command to the host to open the file
        // For P2, we'll log it or send a generic command
        vscode.postMessage('openFile', { uri, line });
    }
</script>

<div class="flex flex-col gap-2 p-2 w-full">
    {#if appState.results.length === 0 && !appState.isSearching}
        <div class="text-center text-muted-foreground text-sm py-8 opacity-60">
            No results found. Try indexing your workspace or changing your query.
        </div>
    {/if}

    {#each appState.results as result}
        <!-- Accessible Card -->
        <button 
            class="flex flex-col text-left gap-1 p-3 rounded-md bg-secondary/20 hover:bg-secondary/40 border border-transparent hover:border-border transition-all cursor-pointer group"
            onclick={() => openFile(result.uri, result.lineStart)}
            onkeydown={(e) => e.key === 'Enter' && openFile(result.uri, result.lineStart)}
        >
            <!-- File Header -->
            <div class="flex items-center gap-2 w-full overflow-hidden">
                <span class="icon-[lucide--file-code] w-4 h-4 text-primary shrink-0"></span>
                <span class="text-xs font-medium text-foreground truncate opacity-80 group-hover:opacity-100">
                    {result.filePath}
                </span>
                <span class="text-xs text-muted-foreground ml-auto shrink-0">
                    Line {result.lineStart}
                </span>
            </div>

            <!-- Code Snippet -->
            <pre class="mt-1 text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto w-full font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                <code>{result.snippet}</code>
            </pre>
        </button>
    {/each}
</div>