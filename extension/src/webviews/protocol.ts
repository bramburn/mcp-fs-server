/**
 * Defines the communication contract between the VS Code Extension (Host)
 * and React Webview (Guest).
 */

// --- Scope Definitions ---
export type IpcScope = "qdrantIndex" | "webview-mgmt";

// --- Base Message Envelope ---
export interface IpcBaseMessage {
  id: string; // UUID for requests/responses
  scope: IpcScope;
  timestamp: number;
}

// --- Command (Fire-and-forget: Guest -> Host, or Host -> Guest) ---
export interface IpcCommand<T> extends IpcBaseMessage {
  kind: "command";
  method: string;
  params: T;
}

// --- Request (Request/Response cycle: Guest <-> Host) ---
export interface IpcRequest<T> extends IpcBaseMessage {
  kind: "request";
  method: string;
  params: T;
}

export interface IpcResponse<T = any, E = string> extends IpcBaseMessage {
  kind: "response";
  responseId: string; // ID of request being responded to
  data?: T;
  error?: E;
}

// --- Notification (One-way update: Host -> Guest, or Guest -> Host) ---
export interface IpcNotification<T> extends IpcBaseMessage {
  kind: "notification";
  method: string;
  params: T;
}

// --- Combined Discriminated Union for easy dispatching ---
export type IpcMessage =
  | IpcCommand<any>
  | IpcRequest<any>
  | IpcResponse<any, string>
  | IpcNotification<any>;

// --- Data Structures ---

export interface FileSnippetResult {
  uri: string; // !AI: Uri serialization to string requires verification that deserialization logic in host is robust against all possible Uri formats.
  filePath: string;
  snippet: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

export interface QdrantOllamaConfig {
  // Provider selections
  active_vector_db: "qdrant" | "pinecone";
  active_embedding_provider: "ollama" | "openai" | "gemini";

  index_info?: {
    name?: string;
    version?: string;
    embedding_dimension?: number; // Vector size for the embedding model
  };

  // Vector Database Configurations (optional based on active_vector_db)
  qdrant_config?: {
    url: string;
    api_key?: string;
  };
  pinecone_config?: {
    index_name: string;
    api_key: string;
  };

  // Embedding Provider Configurations (optional based on active_embedding_provider)
  ollama_config?: {
    base_url: string;
    model: string;
  };
  openai_config?: {
    api_key: string;
    model: string;
  };
  gemini_config?: {
    api_key: string;
    model: string;
  };
}

// --- Specific Messages ---

// 1. Search Request (Guest -> Host)
export interface SearchRequestParams {
  query: string;
  limit?: number; // Maximum number of results to return
  globFilter?: string; // NEW: File pattern filter (e.g., "**/*.ts,*.py")
}
export interface SearchResponseParams {
  results: FileSnippetResult[];
}
export const SEARCH_METHOD = "search";

// 2. Index Status Notification (Host -> Guest)
export interface IndexStatusParams {
  // Added 'no_workspace'
  status: "ready" | "indexing" | "error" | "no_workspace";
  message?: string;
  progress?: number; // 0-100
  stats?: {
    // <--- Add this
    vectorCount: number;
  };
}
export const INDEX_STATUS_METHOD = "index/status";

// 3. Start Indexing Command (Guest -> Host)
export const START_INDEX_METHOD = "index/start";

// 4. Load Configuration Request (Guest -> Host)
export const LOAD_CONFIG_METHOD = "config/load";

// 5. Config Data Notification (Host -> Guest)
export const CONFIG_DATA_METHOD = "config/data";

// 6. Open File Command (Guest -> Host)
export interface OpenFileParams {
  uri: string;
  line: number;
}
export const OPEN_FILE_METHOD = "file/open";

// 7. Copy Results Command (Guest -> Host)
export interface CopyResultsParams {
  mode: "files" | "snippets";
  results: FileSnippetResult[];
  query?: string; // NEW: Original search query for context
  includeQuery?: boolean; // NEW: Query preservation setting
}
export const COPY_RESULTS_METHOD = "results/copy";

// --- Webview Management Messages (Introduced for step 3/5 compliance) ---

// 7. Webview Ready Request (Guest -> Host) - Used to request initial state
// Empty payload represented as a "no properties" object type.
export type WebviewReadyParams = Record<string, never>;
export type WebviewReadyRequest = IpcRequest<WebviewReadyParams>;
export const WEBVIEW_READY_METHOD = "webview/ready-request";

// 8. Execute Command (Guest -> Host) - Used to trigger VS Code API commands
export interface ExecuteCommandParams {
  command: string; // !AI: Security risk - Host must whitelist commands before execution via vscode.commands.executeCommand.
  args?: any[];
}
export type ExecuteCommand = IpcCommand<ExecuteCommandParams>;
export const EXECUTE_COMMAND_METHOD = "webview/execute-command";

// 9. Did Change Configuration Notification (Host -> Guest)
export interface DidChangeConfigurationParams {
  configKey: string;
  value: any;
}
export type DidChangeConfigurationNotification =
  IpcNotification<DidChangeConfigurationParams>;
export const DID_CHANGE_CONFIG_NOTIFICATION =
  "webview/did-change-configuration";

// 10. Save Configuration Request (Guest -> Host)
/**
 * Parameters for SAVE_CONFIG_METHOD.
 *
 * This message is sent as an IpcRequest from the webview to the host.
 * The host MUST reply with an IpcResponse so that the Promise returned
 * by sendRequest in the webview can resolve and tests do not stall.
 */
export interface SaveConfigParams {
  config: QdrantOllamaConfig;
  useGlobal?: boolean; // New optional flag
}
export const SAVE_CONFIG_METHOD = "config/save";

// 11. Test Configuration Request (Guest -> Host)
export interface TestConfigParams {
  config: QdrantOllamaConfig;
}
export interface TestConfigResponse {
  success: boolean;
  message: string;
  // Granular results
  qdrantStatus: "connected" | "failed";
  ollamaStatus: "connected" | "failed";
}
export const TEST_CONFIG_METHOD = "config/test";

// 12. Update Search Settings Request (Guest -> Host)
export interface UpdateSearchSettingsParams {
  limit?: number;
  threshold?: number;
  includeQueryInCopy?: boolean; // NEW: Query preservation setting
}
export const UPDATE_SEARCH_SETTINGS_METHOD = "config/update-search-settings";

// 13. Get Search Settings Request (Guest -> Host)
export interface GetSearchSettingsResponse {
  limit: number;
  threshold: number;
  includeQueryInCopy?: boolean; // NEW: Query preservation setting
}
export const GET_SEARCH_SETTINGS_METHOD = "config/get-search-settings";