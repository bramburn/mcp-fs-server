import { sendCommand, sendRequest, onNotification } from './lib/vscode'; // New IPC functions
import {
    DidChangeConfigurationNotification,
    DID_CHANGE_CONFIG_NOTIFICATION,
    FileSnippetResult,
    IndexStatusParams,
    QdrantOllamaConfig,
    IpcMessage,
    IpcNotification,
    IpcScope,
    CONFIG_DATA_METHOD,
    INDEX_STATUS_METHOD,
} from '../protocol'; // Typed IPC Protocol

// --- State Interfaces (Match IPC Payloads) ---
export interface AppConfig extends QdrantOllamaConfig {} // Use QdrantOllamaConfig directly, but allow undefined for initial state
export interface SnippetResult extends FileSnippetResult {}

// Helper to check if a message is a notification for configuration change
function isDidChangeConfigurationNotification(message: IpcMessage): message is IpcNotification<DidChangeConfigurationNotification['params']> {
    return message.kind === 'notification' && message.method === DID_CHANGE_CONFIG_NOTIFICATION;
}

// Helper to check if a message is a notification for snippets (inferred structure for search results update)
// NOTE: Since DID_CHANGE_SNIPPETS_NOTIFICATION is not defined in protocol.ts, we infer the structure based on the conceptual example.
function isDidChangeSnippetsNotification(message: IpcMessage): message is IpcNotification<{ snippets: SnippetResult[] }> {
    // Assuming a method name like 'snippets/update' or similar for search results notification
    // For now, we'll use a placeholder check that aligns with the conceptual example's intent.
    // A real implementation would require a defined constant in protocol.ts.
    return message.kind === 'notification' && message.method === 'snippets/update';
}

// --- Central Reactive State --
let config = $state<AppConfig | undefined>(undefined);
let searchResults = $state<SnippetResult[]>([]);
let searchQuery = $state('');
let isSearching = $state(false);
let currentView = $state<'Search' | 'Settings' | 'test'>('Search');
let indexStatus = $state<IndexStatusParams['status']>('ready');
let indexProgress = $state(0);


// --- Derived State (Reactivity based on primary state) --
export const store = {
    // Expose state properties as read-only accessors
    get config() { return config; },
    set config(value) { config = value; }, // Allow setting for external updates
    get searchResults() { return searchResults; },
    set searchResults(value) { searchResults = value; },
    get searchQuery() { return searchQuery; },
    set searchQuery(value) { searchQuery = value; },
    get isSearching() { return isSearching; },
    set isSearching(value) { isSearching = value; },
    get currentView() { return currentView; },
    set currentView(value) { currentView = value; },
    get view() { return currentView.toLowerCase(); },
    get indexStatus() { return indexStatus; },
    set indexStatus(value) { indexStatus = value; },
    get indexProgress() { return indexProgress; },
    set indexProgress(value) { indexProgress = value; },

    // Example: Derived value based on search results
    get hasResults() { return searchResults.length > 0; },
};

// --- IPC Setup and Event Handling (Runs only once) --
// Initialize IPC listener only once using $effect.root
$effect.root(() => {
    onNotification<QdrantOllamaConfig>(CONFIG_DATA_METHOD, (newConfig) => {
        config = newConfig;
    });

    onNotification<IndexStatusParams>(INDEX_STATUS_METHOD, (params) => {
        indexStatus = params.status;
        indexProgress = params.progress ?? 0;
    });

    onNotification<{ configKey: string, value: any }>(DID_CHANGE_CONFIG_NOTIFICATION, (params) => {
        // Handle configuration changes, e.g., update `showStale` if it's managed here
        // This is a placeholder for where global preferences would update the store
        console.log(`Configuration changed for key: ${params.configKey}, value: ${params.value}`);
    });
    
    // Request initial state from host upon load (Optional but good practice)
    // sendRequest('webview/ready-request', 'webview-mgmt', {}); // Assuming such a request exists

    // Since effects are automatically cleaned up on destroy, this root effect lives
    // for the duration of the component's (App.svelte) lifecycle.
});


// --- Export Actions for Component Interaction ---
export function updateSearchInput(query: string) {
    searchQuery = query;
}

export function toggleView(view: 'Search' | 'Settings' | 'test') {
    currentView = view;
}

// We export the store object as the application's central state access point
export default store;