/**
 * Defines the communication contract between the VS Code Extension (Host)
 * and React Webview (Guest).
 */

// --- Scope Definitions ---
export type IpcScope = 'qdrantIndex' | 'webview-mgmt';

// --- Base Message Envelope ---
export interface IpcBaseMessage {
    id: string; // UUID for requests/responses
    scope: IpcScope;
    timestamp: number;
}

// --- Command (Fire-and-forget: Guest -> Host, or Host -> Guest) ---
export interface IpcCommand<T> extends IpcBaseMessage {
    kind: 'command';
    method: string;
    params: T;
}

// --- Request (Request/Response cycle: Guest <-> Host) ---
export interface IpcRequest<T> extends IpcBaseMessage {
    kind: 'request';
    method: string;
    params: T;
}

export interface IpcResponse<T = any, E = string> extends IpcBaseMessage {
    kind: 'response';
    responseId: string; // ID of the request being responded to
    data?: T;
    error?: E;
}

// --- Notification (One-way update: Host -> Guest, or Guest -> Host) ---
export interface IpcNotification<T> extends IpcBaseMessage {
    kind: 'notification';
    method: string;
    params: T;
}

// --- Combined Discriminated Union for easy dispatching ---
export type IpcMessage = 
    | IpcCommand<any>
    | IpcRequest<any>
    | IpcResponse<any>
    | IpcNotification<any>;


// --- Data Structures ---

export interface FileSnippetResult {
    uri: string; // !AI: Uri serialization to string requires verification that the deserialization logic in the host is robust against all possible Uri formats.
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

// --- Webview Management Messages (Introduced for step 3/5 compliance) ---

// 7. Webview Ready Request (Guest -> Host) - Used to request initial state
// Empty payload represented as a "no properties" object type.
export type WebviewReadyParams = Record<string, never>;
export type WebviewReadyRequest = IpcRequest<WebviewReadyParams>;
export const WEBVIEW_READY_METHOD = 'webview/ready-request';

// 8. Execute Command (Guest -> Host) - Used to trigger VS Code API commands
export interface ExecuteCommandParams {
    command: string; // !AI: Security risk - Host must whitelist commands before execution via vscode.commands.executeCommand.
    args?: any[];
}
export type ExecuteCommand = IpcCommand<ExecuteCommandParams>;
export const EXECUTE_COMMAND_METHOD = 'webview/execute-command';

// 9. Did Change Configuration Notification (Host -> Guest)
export interface DidChangeConfigurationParams {
    configKey: string;
    value: any;
}
export type DidChangeConfigurationNotification = IpcNotification<DidChangeConfigurationParams>;
export const DID_CHANGE_CONFIG_NOTIFICATION = 'webview/did-change-configuration';