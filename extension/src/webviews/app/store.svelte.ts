import type { FileSnippetResult, IndexStatusParams } from '../../protocol';

/**
 * Global Application State using Svelte 5 Runes.
 */
class AppState {
    // UI State
    view = $state<'search' | 'settings'>('search');
    
    // Search Data
    query = $state('');
    results = $state<FileSnippetResult[]>([]);
    isSearching = $state(false);

    // Indexing Data
    indexStatus = $state<IndexStatusParams['status']>('ready');
    indexProgress = $state(0);
    
    // Actions
    setResults(results: FileSnippetResult[]) {
        this.results = results;
        this.isSearching = false;
    }

    setIndexStatus(status: IndexStatusParams['status']) {
        this.indexStatus = status;
    }

    setView(view: 'search' | 'settings') {
        this.view = view;
    }
}

export const appState = new AppState();