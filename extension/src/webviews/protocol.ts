/**
 * Defines the communication contract between the VS Code Extension (Host)
 * and the Svelte Webview (Guest).
 */

export type IpcScope = 'qdrantIndex';
export const Scope: IpcScope = 'qdrantIndex';

// --- Base Types ---

export interface IpcMessage {
    id: string; // UUID
    scope: IpcScope;
    method: string;
    timestamp: number;
    kind?: 'command' | 'request' | 'response' | 'notification';
}

export interface IpcCommand<T = any> extends IpcMessage {
    kind: 'command';
    params: T;
}

export interface IpcRequest<T = any> extends IpcMessage {
    kind: 'request';
    params: T;
}

export interface IpcResponse<T = any> extends IpcMessage {
    kind: 'response';
    responseId: string; // ID of the request being responded to
    data?: T;
    error?: string;
}

export interface IpcNotification<T = any> extends IpcMessage {
    kind: 'notification';
    params: T;
}

// --- Data Structures ---

export interface FileSnippetResult {
    uri: string; // Serialized vscode.Uri
    filePath: string;
    snippet: string;
    lineStart: number;
    lineEnd: number;
    score: number;
}

export interface QdrantOllamaConfig {
    index_info?: {
        name: string;
        version?: string;
    };
    qdrant_config: {
        url: string;
        api_key?: string;
    };
    ollama_config: {
        base_url: string;
        model: string;
    };
}

// --- Specific Messages ---

// 1. Search Request (Guest -> Host)
export interface SearchRequestParams {
    query: string;
}
export interface SearchResponseParams {
    results: FileSnippetResult[];
}
export const SEARCH_METHOD = 'search';

// 2. Index Status Notification (Host -> Guest)
export interface IndexStatusParams {
    status: 'ready' | 'indexing' | 'error';
    message?: string;
    progress?: number; // 0-100
}
export const INDEX_STATUS_METHOD = 'index/status';

// 3. Start Indexing Command (Guest -> Host)
export const START_INDEX_METHOD = 'index/start';

// 4. Load Configuration Request (Guest -> Host)
export const LOAD_CONFIG_METHOD = 'config/load';

// 5. Config Data Notification (Host -> Guest)
export const CONFIG_DATA_METHOD = 'config/data';

// 6. Open File Command (Guest -> Host)
export interface OpenFileParams {
    uri: string;
    line: number;
}
export const OPEN_FILE_METHOD = 'file/open';