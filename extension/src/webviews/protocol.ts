/**
 * Defines the communication contract between the VS Code Extension (Host)
 * and React Webview (Guest).
 */

// --- Scope Definitions ---
export type IpcScope = "qdrantIndex" | "webview-mgmt" | "debugger";

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
  uri: string;
  filePath: string;
  snippet: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

/**
 * LEGACY: Represents the structure of the old .qdrant/configuration.json file.
 * Used only for the migration feature.
 */
export interface QdrantOllamaConfig {
  active_vector_db: "qdrant" | "pinecone";
  active_embedding_provider: "ollama" | "openai" | "gemini";
  index_info?: {
    name?: string;
    version?: string;
    embedding_dimension?: number;
  };
  qdrant_config?: {
    url: string;
    api_key?: string;
  };
  pinecone_config?: {
    index_name: string;
    environment: string;
    api_key: string;
  };
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

export interface VSCodeSettings {
  activeVectorDb: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  pineconeIndexName: string;
  pineconeEnvironment: string;
  pineconeApiKey: string;
  activeEmbeddingProvider: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  indexName: string;
  embeddingDimension: number;
  searchLimit: number;
  searchThreshold: number;
  includeQueryInCopy: boolean;
}

// --- Specific Messages ---

// 1. Search Request
export interface SearchRequestParams {
  query: string;
  limit?: number;
  globFilter?: string;
}
export interface SearchResponseParams {
  results: FileSnippetResult[];
}
export const SEARCH_METHOD = "search";

// 2. Index Status Notification
export interface IndexStatusParams {
  status: "ready" | "indexing" | "error" | "no_workspace";
  message?: string;
  progress?: number;
  stats?: {
    vectorCount: number;
  };
}
export const INDEX_STATUS_METHOD = "index/status";

// 3. Start Indexing Command
export const START_INDEX_METHOD = "index/start";

// 4. Load Configuration Request
export const LOAD_CONFIG_METHOD = "config/load";

// 5. Config Data Notification
export const CONFIG_DATA_METHOD = "config/data";

// 6. Open File Command
export interface OpenFileParams {
  uri: string;
  line: number;
}
export const OPEN_FILE_METHOD = "file/open";

// 7. Copy Results Command
export interface CopyResultsParams {
  mode: "files" | "snippets";
  results: FileSnippetResult[];
  query?: string;
  includeQuery?: boolean;
}
export const COPY_RESULTS_METHOD = "results/copy";

// --- Webview Management Messages ---

export type WebviewReadyParams = Record<string, never>;
export type WebviewReadyRequest = IpcRequest<WebviewReadyParams>;
export const WEBVIEW_READY_METHOD = "webview/ready-request";

export interface ExecuteCommandParams {
  command: string;
  args?: any[];
}
export type ExecuteCommand = IpcCommand<ExecuteCommandParams>;
export const EXECUTE_COMMAND_METHOD = "webview/execute-command";

export interface DidChangeConfigurationParams {
  configKey: string;
  value: any;
}
export type DidChangeConfigurationNotification =
  IpcNotification<DidChangeConfigurationParams>;
export const DID_CHANGE_CONFIG_NOTIFICATION =
  "webview/did-change-configuration";

export interface SaveConfigParams {
  config: QdrantOllamaConfig;
  useGlobal?: boolean;
}
export const SAVE_CONFIG_METHOD = "config/save";

export interface TestConfigParams {
  config: QdrantOllamaConfig;
}
export interface TestConfigResponse {
  success: boolean;
  message: string;
  qdrantStatus: "connected" | "failed";
  ollamaStatus: "connected" | "failed";
}
export const TEST_CONFIG_METHOD = "config/test";

export interface UpdateSearchSettingsParams {
  limit?: number;
  threshold?: number;
  includeQueryInCopy?: boolean;
}
export const UPDATE_SEARCH_SETTINGS_METHOD = "config/update-search-settings";

export interface GetSearchSettingsResponse {
  limit: number;
  threshold: number;
  includeQueryInCopy?: boolean;
}
export const GET_SEARCH_SETTINGS_METHOD = "config/get-search-settings";

export const GET_VSCODE_SETTINGS_METHOD = "config/get-vscode-settings";
export const UPDATE_VSCODE_SETTINGS_METHOD = "config/update-vscode-settings";

// --- Debugger Messages ---

// 16. Debug Analyze Request (Guest -> Host)
export interface DebugAnalyzeResponse {
  hasActiveEditor: boolean;
  filePath?: string;
  fileName?: string;
  errorCount?: number;
  language?: string;
}
export const DEBUG_ANALYZE_METHOD = "debug/analyze";

// 17. Debug Copy Command (Guest -> Host)
export interface DebugCopyParams {
  includePrompt?: boolean;
}
export const DEBUG_COPY_METHOD = "debug/copy";