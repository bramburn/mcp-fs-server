import { writable } from 'svelte/store';
// Fixed: Added .ts extension
import type { FileSnippetResult, IndexStatusParams, QdrantOllamaConfig } from '../../webviews/protocol.ts';

export const view = writable<'search' | 'settings'>('search');
export const query = writable('');
export const results = writable<FileSnippetResult[]>([]);
export const isSearching = writable(false);
export const indexStatus = writable<IndexStatusParams['status']>('ready');
export const indexProgress = writable(0);
export const config = writable<QdrantOllamaConfig | null>(null);

class AppState {
    get view() {
        let v: 'search' | 'settings' = 'search';
        view.subscribe(val => v = val)();
        return v;
    }
    set view(val: 'search' | 'settings') {
        view.set(val);
    }

    get query() {
        let q = '';
        query.subscribe(val => q = val)();
        return q;
    }
    set query(val: string) {
        query.set(val);
    }

    get results() {
        let r: FileSnippetResult[] = [];
        results.subscribe(val => r = val)();
        return r;
    }
    set results(val: FileSnippetResult[]) {
        results.set(val);
    }

    get isSearching() {
        let s = false;
        isSearching.subscribe(val => s = val)();
        return s;
    }
    set isSearching(val: boolean) {
        isSearching.set(val);
    }

    get indexStatus() {
        let s: IndexStatusParams['status'] = 'ready';
        indexStatus.subscribe(val => s = val)();
        return s;
    }
    set indexStatus(val: IndexStatusParams['status']) {
        indexStatus.set(val);
    }

    get config() {
        let c: QdrantOllamaConfig | null = null;
        config.subscribe(val => c = val)();
        return c;
    }
    set config(val: QdrantOllamaConfig | null) {
        config.set(val);
    }

    setResults(results: FileSnippetResult[]) {
        this.results = results;
        this.isSearching = false;
    }

    setIndexStatus(status: IndexStatusParams['status']) {
        this.indexStatus = status;
    }

    setConfig(configData: QdrantOllamaConfig | null) {
        this.config = configData;
    }

    setView(view: 'search' | 'settings') {
        this.view = view;
    }
}

export const appState = new AppState();