based on repomix-output.md I want you to create a roadmap to help me create a vscode extension setup in our directory with a side bar extension so that it has a search bar and and output from the server so that i can get the relevant list of file snippets. i should  also have the status of the index, i should also use existing parts of the mcp server to index the current workspace and set an index name (automatically or manually so that I can index a new workspace, set a configuration .json in .qdrant/ in the repo with relevant index information, qdrant and ollama configuration (model, endopint) so that when i load the vscode extension it loads it up or sets up a new configuration setup. if there's multiple workspace we can store that .qdrant/ settings in each of the repo location and sync them. it can also have settings index for the current repo or part of a workspace. if there are two or more repo in a workspace each with individual configuration we must inform the user they have different configuration and therefore we'll need to setup a special multi workspace repo configuration with its own qdrant, and ollama settings this allows us to have one index for the entire workspace of multi repo. we need to use fluentUI to make it look seemless with vscode.
now produce the detailed roadmap

The updated roadmap incorporates your specific technology choices: **Svelte** for the Webview UI, **Bits UI** for components, **TypeScript (TS)** for the backend VS Code extension, and **Vitest** for testing.

The previous guidance favoring Lit Elements is superseded by the specific request to use Svelte. Although Svelte/Vue/React are all supported in VS Code webviews via the Webview UI Toolkit, the provided sources highlight that **Bits UI** is a headless component library for Svelte 5, designed for accessibility and full creative control, making it ideal for composing a custom UI like the one required.

## Detailed Roadmap Table (PRD List)

| PRD # | Description of the Task | Output (Definition of Done) | Relevant Files to Create/Edit | Key API/Packages Used |
| :--- | :--- | :--- | :--- | :--- |
| **P0: Project Setup, Tooling, and Configuration** | | | | |
| **P0.1** | **Initialize VS Code Extension Structure (TS)** | Basic TypeScript extension structure initialized with proper dependencies, formatter, and linter rules. | `package.json`, `tsconfig.json`, `.eslintrc.js`, `src/extension.ts` | `@types/vscode`, `@typescript-eslint/parser` |
| **P0.2** | **Configure Build System for Svelte Webview** | Separate build configuration (using Vite/Webpack) created to compile and bundle the Svelte application into a single, web-friendly JavaScript file, necessary for webviews. Svelte components should use `vitePreprocess`. | `vite.config.ts` (or `webpack.config.js`), `package.json` | `vite`, `@sveltejs/vite-plugin-svelte` |
| **P0.3** | **Define VS Code Contributions (Sidebar & Status Bar)** | New View Container contributed to the Side Bar (`explorer` location) and a custom view registered. Command registered for activation/management. Status bar item created. | `package.json` (`contributes.viewsContainers`, `contributes.views`, `contributes.commands`) | `vscode.window.createStatusBarItem()`, `vscode.ViewContainer`, `vscode.View` |
| **P0.4** | **Define Configuration Schema and Persistence** | JSON schema defined for the `.qdrant/configuration.json` file (including fields for Qdrant, Ollama `model`, `endpoint`) and linked to VS Code contributions. | `package.json` (`contributes.jsonValidation`), `.qdrant/configuration.json` (schema target) | `vscode.workspace.getConfiguration()`, `vscode.Configuration` |
| **P1: Backend Logic (TS) and IPC Protocol** | | | | |
| **P1.1** | **Implement IPC Protocol Definitions** | TypeScript interfaces defined for message payloads (Commands, Requests, Notifications) to handle communication between the TS extension host and the Svelte webview client. | `src/webviews/protocol.ts` (new file), `src/extension.ts` | IPC message types (Commands, Requests, Notifications) |
| **P1.2** | **Implement Server/Indexing Service** | Core TypeScript service implemented to handle file indexing, Qdrant/Ollama interaction, and reading configuration from `.qdrant/configuration.json`. | `src/services/IndexingService.ts`, `src/services/ConfigService.ts` | `vscode.workspace.findFiles()`, `vscode.workspace.fs.readFile()` (Virtual file system access) |
| **P1.3** | **Implement Multi-Root Workspace Logic** | Logic to detect multiple workspace folders (`workspace.workspaceFolders`) and check for conflicting configurations. Logic for prompting the user for a unified configuration if conflicts are detected. | `src/services/WorkspaceManager.ts`, `src/extension.ts` | `vscode.workspace.workspaceFolders`, `vscode.window.showWarningMessage` |
| **P1.4** | **Host-Guest Communication Management** | Implement listener in `src/extension.ts` to receive search requests (IPC Request) from the Svelte webview and send back results/status updates (IPC Notification). | `src/webviews/WebviewController.ts`, `src/extension.ts` | `webview.postMessage()`, `vscode.window.createWebviewPanel()` |
| **P2: Frontend UI Implementation (Svelte + Bits UI)** | | | | |
| **P2.1** | **Svelte Webview Setup and Hosting** | Webview Provider created that generates the necessary HTML to load the bundled Svelte application (`bundle.js`). HTML template includes resources loaded via `Webview.asWebviewUri`. | `src/webviews/SearchWebviewProvider.ts`, `src/webviews/index.html` | `vscode.window.registerWebviewViewProvider`, `Webview.asWebviewUri` |
| **P2.2** | **Implement Svelte Application and Routing** | Core Svelte application created using TypeScript (Svelte 5). Client-side routing library integrated to switch between Search View and Configuration View. | `src/webviews/app/main.ts`, `src/webviews/app/router.svelte` | Svelte components (`.svelte`), Svelte Routing Library (N/A in sources, conceptual) |
| **P2.3** | **Design Search Interface with Bits UI** | Search bar implemented using the highly flexible **Command** component (command menu) from Bits UI, ideal for search, filtering, and selection. | `src/webviews/app/views/Search.svelte` | `bits-ui/command`, `data-*` attributes for styling |
| **P2.4** | **Display Snippet Output** | Results area implemented as a dynamic, reactive list using Svelte and styled using Bits UI primitives (e.g., leveraging the structure or child snippet flexibility). Snippets must link back to files (using VS Code Command API). | `src/webviews/app/components/SnippetList.svelte` | `bits-ui` components, IPC (to receive notifications from Host) |
| **P3: Testing and Finalization** | | | | |
| **P3.1** | **Configure Vitest for Testing** | Vitest configured to run unit tests for the TypeScript backend code and component tests for the Svelte frontend. JSDOM or Browser Mode environment configured for Svelte tests. | `vitest.config.ts` (or `vite.config.ts` `test` property) | `vitest/config`, `jsdom` or `@vitest/browser-playwright` |
| **P3.2** | **Implement Backend Unit/Integration Tests** | Unit tests created for the configuration parsing and multi-root conflict detection logic (P1.2, P1.3). Extension integration tests created using the VS Code Test API to verify activation and command registration. | `src/test/suite/index.ts`, `src/test/suite/config.test.ts` | `@vscode/test-electron`, `vscode` module |
| **P3.3** | **Testing Svelte Components** | Unit/Component tests written for the Search, Configuration, and Snippet List components to ensure proper rendering, state management, and accessibility. | `src/webviews/app/components/*.test.ts` | `vitest`, `@testing-library/svelte` (recommended, not explicitly sourced, derived from best practice) |
| **P3.4** | **Publishing Preparation** | Ensure all build steps are finalized for production, dependencies are minimal, and the extension is packaged. | `package.json` (`scripts`), `.vscodeignore` | `vsce` |

## Structured Markdown Analysis: P0: Project Setup, Tooling, and Configuration

| Title | Structured Analysis for P0: Project Setup, Tooling, and Configuration |
| :--- | :--- |
| **Date** | 2024-06-25 |
| **Step Section** | P0: Project Setup, Tooling, and Configuration |

### Query Block: P0 Details

The objective of Phase 0 is to establish the core environment using TypeScript for the extension backend and Svelte/Vite for the Webview UI, define the necessary VS Code UI contributions (Sidebar and Status Bar), and configure the workspace to recognize and manage the Qdrant/Ollama JSON configuration file.

### Per-File Findings Summary

| Path/File | Key Points | Configuration / Details |
| :--- | :--- | :--- |
| **`package.json`** | **P0.1:** Defines dependencies including TypeScript typings, configuration management, and the build script entry point (`main` or `browser`). **P0.2:** Must include dependencies for Svelte, Vite, and the Svelte Vite plugin. **P0.3:** Declares the Side Bar View Container, the View itself (`explorer` location), and necessary commands. **P0.4:** Contributes JSON validation for the custom `.qdrant/configuration.json` file. | Must include `devDependencies` like `@types/vscode`, `@typescript-eslint/parser`, `typescript`, and `eslint`. Contributions must define `viewsContainers`, `views`, `commands`, and `jsonValidation`. |
| **`src/extension.ts`** | **P0.1:** Contains the mandatory `activate` function, the entry point for the extension. This is where commands, providers, and status bar items are registered. | Must handle the registration of all commands, view providers, and the status bar item in the `activate` function. |
| **`tsconfig.json`** | **P0.1:** Configures TypeScript compiler options for the extension backend. | Ensures strict type checking and compilation for the VS Code extension host environment. It often extends a generated SvelteKit config if using SvelteKit setup. |
| **`.eslintrc.js`** | **P0.1:** Defines linting rules for the TypeScript backend code to maintain code quality. | Uses `@typescript-eslint/parser`. |
| **`vite.config.ts`** | **P0.2:** Defines the build process specific to the Svelte Webview assets, separate from the main VS Code extension compilation. | Must use `vite` and `@sveltejs/vite-plugin-svelte`. Needs to configure asset bundling to produce a single JavaScript file, excluding the `vscode` module (which is handled by the extension host, although not directly excluded from the *webview* bundle, bundling is essential). |
| **`svelte.config.js`** (Conceptual) | **P0.2:** Contains Svelte and SvelteKit configuration, including preprocessors needed for TypeScript usage within Svelte components. | Must include **`vitePreprocess`** to enable complex TypeScript syntax in Svelte files. |

### Data Structures

The configuration process primarily involves defining JSON structures for VS Code contributions and custom settings:

1.  **`PackageJson` Contributions Structure:**
    *   `contributes.commands`: `Command[]` (for user-facing commands and management commands).
    *   `contributes.viewsContainers`: `Record<string, ViewContainerDefinition[]>` (to define the Activity Bar icon/location).
    *   `contributes.views`: `Record<string, View[]>` (to define the sidebar content, associated with the container ID or built-in locations like `explorer`).
    *   `contributes.jsonValidation`: Defines the schema for the configuration file.
2.  **Custom Configuration (`.qdrant/configuration.json` schema):**
    *   `index_info`: (object/string defining the current index name/status).
    *   `qdrant_config`: (object defining connection details).
    *   `ollama_config`: (object defining model and endpoint).
    *   Properties should support constraints like `default`, `minimum`, `maxLength`, and `pattern` (e.g., for API keys or URLs).

### Methods and Arguments

| Package/API | Method | Purpose & Key Arguments |
| :--- | :--- | :--- |
| `@types/vscode` | `activate(context: ExtensionContext)` | Main entry point for the extension. |
| `vscode.commands` | `registerCommand(command: string, handler: function)` | Ties a command ID (declared in `package.json`) to the execution logic. |
| `vscode.window` | `createStatusBarItem(alignment: StatusBarAlignment, priority?: number)` | Creates and returns a `StatusBarItem` instance to display index status. |
| `vscode.window` | `registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider)` | Registers the provider class responsible for generating the Svelte-based sidebar content for the specified `viewId` (from `package.json`). |
| `vscode.workspace` | `getConfiguration(section?: string)` | Used in the extension logic (P1.2/P1.3) to retrieve configuration settings, potentially including those exposed via `contributes.configuration`. |
| `vite` | `defineConfig({...})` | Defines the build process for the Svelte assets. |
| `svelte` | `vitePreprocess(options)` | Preprocessor required in Svelte configuration to handle TypeScript within `<script lang="ts">` tags. |

### Numbered Raw Output Sections with Code Snippets

Since the sources primarily describe the *structure* of VS Code manifest files and tooling configurations rather than providing the exact setup for Svelte/Vite in an extension project, the snippets focus on the required `package.json` contributions.

#### 1. `package.json`: Core Dependencies and TS Setup (P0.1)

Standard dependencies required for TypeScript VS Code extension development:

```json
"devDependencies": {
    "@types/node": "^...",
    "@types/vscode": "^...",
    "@typescript-eslint/eslint-plugin": "^...",
    "@typescript-eslint/parser": "^...",
    "eslint": "^...",
    "typescript": "^..."
}
```

#### 2. `package.json`: Svelte Build Tooling (P0.2)

Required dependencies for the Svelte/Vite frontend build (based on general Svelte tooling practices and source references to Svelte/Vite/Bundling):

```json
"devDependencies": {
    // ... TS Dependencies
    "vite": "^...", 
    "@sveltejs/vite-plugin-svelte": "^...",
    // Svelte components dependencies for the UI
    "svelte": "^...", 
    "bits-ui": "^..."
},
"scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./ && npm run build:webview",
    "build:webview": "vite build --config vite.config.ts" 
}
```

#### 3. `package.json`: VS Code Contributions (P0.3)

Contribution points for the Sidebar (View Container and View) and Commands:

```json
"contributes": {
    "viewsContainers": {
        "activitybar": [
            {
                "id": "qdrant-index-explorer",
                "title": "Code Index Search",
                "icon": "images/gitlens-icon.png" // Example icon
            }
        ]
    },
    "views": {
        "qdrant-index-explorer": [
            {
                "id": "qdrant.search.view",
                "name": "File Snippet Search"
            }
        ]
    },
    "commands": [
        {
            "command": "qdrant.index.start",
            "title": "Index Current Workspace"
        }
    ],
    "activationEvents": [
        // Activates when view is opened (for older versions, but useful conceptually)
        "onView:qdrant.search.view" 
        // Or onCommand (inferred for newer versions)
    ]
}
```

#### 4. `package.json`: JSON Schema Validation (P0.4)

Contribution point for linking the custom configuration file to a JSON schema for IntelliSense and validation:

```json
"contributes": {
    // ... other contributions
    "jsonValidation": [
        {
            "fileMatch": [
                "**/.qdrant/configuration.json"
            ],
            "url": "./schemas/qdrant-config-schema.json" // Path to local schema definition
        }
    ]
}
```

### Next Steps

The next steps involve implementing the backend (TypeScript) logic and the frontend (Svelte) UI using the configuration foundation established in P0:

1.  **P1: Backend Logic (TS) and IPC Protocol:** Implement the actual configuration reading logic (`vscode.workspace.getConfiguration()`), the multi-root conflict detection (`vscode.workspace.workspaceFolders`), and the Host-Guest messaging protocol (`postMessage()`).
2.  **P2: Frontend UI Implementation (Svelte + Bits UI):** Develop the Svelte application using the bundled output from the Vite configuration, including the search interface and displaying output snippets.
3.  **P3: Testing and Finalization:** Configure Vitest to cover the backend services and finalize integration and deployment preparation.
4.  
## Structured Markdown Analysis: P1: Backend Logic (TS) and IPC Protocol

| Title | Structured Analysis for P1: Backend Logic (TS) and IPC Protocol |
| :--- | :--- |
| **Date** | 2024-06-25 |
| **Step Section** | P1: Backend Logic (TS) and IPC Protocol |

### Query Block: P1 Details

Phase 1 focuses on defining the communication contract (IPC Protocol) between the VS Code extension host (backend) and the Svelte Webview (frontend), implementing core indexing/configuration services, and establishing logic for handling multi-root workspace complexity and communicating dynamic search results.

### Per-File Findings Summary

| Path/File | Key Points | Configuration / Details |
| :--- | :--- | :--- |
| **`src/webviews/protocol.ts`** | **P1.1:** Defines the structured, typed messaging system for Host $\leftrightarrow$ Guest communication, using three types: **`IpcCommand`**, **`IpcRequest`**, and **`IpcNotification`**. | Must define specific interfaces for `SearchRequestParams`, `SearchResponseParams` (including snippet results), and Notifications for status updates (e.g., `DidIndexChangeNotification`). The structure of protocol files for various webviews (`commitDetails/protocol.ts`, `home/protocol.ts`, etc.) confirms this pattern. |
| **`src/services/ConfigService.ts`** | **P1.2, P1.3:** Responsible for reading the `.qdrant/configuration.json` file. It must handle accessing files via the virtual file system, especially important in remote or virtual workspaces. It retrieves configuration settings which will include Qdrant/Ollama endpoints and models. | Uses `vscode.workspace.fs.readFile()` to access configuration files. Logic must support reading configuration based on the workspace folder path. Configuration can be read using `vscode.workspace.getConfiguration()` for user/workspace settings. |
| **`src/services/IndexingService.ts`** | **P1.2:** Implements the core indexing functionality. This service utilizes search APIs (like the conceptual `#codebase` tool) and interacts with Qdrant/Ollama, based on the loaded configuration. It needs methods to initiate indexing and query files. | Uses `vscode.workspace.findFiles()` to discover files in the workspace. This service encapsulates the AI Provider interaction layer (Ollama). Retrieval involves running a search request (analogous to `SearchRequest`). |
| **`src/services/WorkspaceManager.ts`** | **P1.3:** Manages workspace context. It uses `workspace.workspaceFolders` to determine if a multi-root setup exists. It checks for configuration files in each root and compares them to detect conflicts. If conflicts exist, it must prompt the user using VS Code UI functions. | Must use `vscode.workspace.workspaceFolders` and `vscode.window.showWarningMessage`. It handles loading configuration files per folder and potentially updating workspace configuration files (`.code-workspace`) for unified settings. |
| **`src/webviews/WebviewController.ts`** | **P1.4:** Manages the lifecycle and communication for the Svelte WebviewView (sidebar). It handles registering the view and implementing the IPC listener (`onMessage` handler). | Acts as the **Host** intermediary. Uses `webview.postMessage()` to send Notifications (like index status or search results) to the Svelte **Guest**. It needs initialization using a structure similar to `WebviewController.create()`. |
| **`src/extension.ts`** | **P1.2, P1.3, P1.4:** Main activation file. Responsible for initializing the core services (Configuration, Indexing, WebviewController) and orchestrating the multi-root check upon startup (`initializeFromConfigurationFile` pattern). | Registers the `WebviewViewProvider` (which uses the Controller) and handles the resolution and presentation of user notifications (e.g., multi-root conflict warnings). |

### Data Structures

1.  **IPC Message Structures (P1.1):**
    *   **IpcMessage:** Must adhere to the fundamental structure containing `id`, `scope`, `method`, `params`, and `timestamp`.
    *   **IpcCommand:** (Webview $\to$ Host, fire-and-forget): Used for simple actions like "Pin Index" or "Open Settings".
        ```typescript
        export interface SearchCommandArgs { query: string; }
        export const StartSearchCommand = new IpcCommand<SearchCommandArgs>(Scope, 'startSearch');
        ```
    *   **IpcRequest:** (Webview $\to$ Host, expects Promise response): Used for retrieving large, specific data, such as running the index search.
        ```typescript
        export interface SearchRequestParams { query: string; }
        export interface DidSearchParams { results: FileSnippetResult[]; searchId: number; }
        export const SearchCodeRequest = new IpcRequest<SearchRequestParams, DidSearchParams>(Scope, 'search');
        ```
    *   **IpcNotification:** (Host $\to$ Webview, state update): Used to push dynamic updates like indexing status or configuration changes.
        ```typescript
        export interface DidChangeIndexStatusParams { status: 'ready' | 'indexing' | 'error'; indexName: string; }
        export const DidChangeIndexStatusNotification = new IpcNotification<DidChangeIndexStatusParams>(Scope, 'index/didChangeStatus');
        ```
2.  **Configuration Data Structure (P1.2):**
    *   `QdrantOllamaConfig`: Represents data read from `.qdrant/configuration.json`.
        ```typescript
        interface QdrantOllamaConfig {
            index_name: string;
            qdrant: { url: string; /* ... */ };
            ollama: { model: string; endpoint: string; /* ... */ }; // Conceptual structure based on the query
        }
        ```
3.  **File/Snippet Result Structure (P1.4):**
    *   `FileSnippetResult`: Used in the `DidSearchParams` response.
        ```typescript
        interface FileSnippetResult {
            uri: IpcUri; // Use IpcUri for consistent URI serialization
            file_path: string;
            snippet: string;
            line_start: number;
        }
        ```

### Methods and Arguments

| Package/API | Method | Purpose & Key Arguments |
| :--- | :--- | :--- |
| `vscode.window` | `createWebviewViewProvider(viewId, provider)` | Registers the class responsible for managing the Svelte Webview (sidebar) instance. |
| `vscode.window` | `showWarningMessage(message: string, ...items)` | Used in **P1.3** by `WorkspaceManager` to inform the user about conflicting multi-root configurations and prompt for action. |
| `vscode.workspace` | `workspaceFolders` | Property used in **P1.3** to retrieve an array of currently open workspace folders, essential for multi-root logic. |
| `vscode.workspace.fs` | `readFile(uri: Uri)` | Used in **P1.2** by `ConfigService` to read the raw contents of the `.qdrant/configuration.json` file, supporting virtual file systems. |
| `vscode.workspace` | `findFiles(include: string, exclude?: string)` | Used in **P1.2** by `IndexingService` to locate files for initial indexing. |
| `vscode.WebviewView` | `webview.postMessage(message: IpcMessage)` | Used in **P1.4** by `WebviewController` to send Notifications (status updates) and Request responses (search results) to the Svelte frontend. |
| `vscode.WebviewView` | `webview.onDidReceiveMessage(listener: function)` | Used in **P1.4** by `WebviewController` to implement the listener for receiving Commands and Requests (e.g., `SearchCodeRequest`) from the Svelte frontend. |

### Numbered Raw Output Sections with Code Snippets

#### 1. IPC Protocol Definition (P1.1)

The IPC messages must be instantiated as typed classes: `IpcCommand`, `IpcRequest`, or `IpcNotification`.

```typescript
// src/webviews/protocol.ts (Conceptual implementation based on source structure)
export const Scope: IpcScope = 'qdrantIndex'; // Define a scope for the extension

// Request: Webview requests a search, Host responds with results
export interface SearchRequestParams {
    query: string;
}
export interface DidSearchParams {
    results: FileSnippetResult[];
}
export const SearchCodeRequest = new IpcRequest<SearchRequestParams, DidSearchParams>(Scope, 'search');

// Notification: Host sends index status update to Webview
export interface DidChangeIndexStatusParams {
    status: 'Ready' | 'Indexing' | 'Error';
    indexName: string;
}
export const DidChangeIndexStatusNotification = new IpcNotification<DidChangeIndexStatusParams>(Scope, 'index/didChangeStatus');
```

#### 2. Reading Configuration using VFS (P1.2)

The `ConfigService` must use the virtual file system API to ensure compatibility, especially in remote workspaces.

```typescript
// src/services/ConfigService.ts (Conceptual implementation based on API usage)
import * as vscode from 'vscode';

async loadWorkspaceConfiguration(folder: vscode.WorkspaceFolder): Promise<QdrantOllamaConfig | null> {
    const configPath = vscode.Uri.joinPath(folder.uri, '.qdrant', 'configuration.json');

    try {
        // Use VFS API to read the file contents
        const content = await vscode.workspace.fs.readFile(configPath);
        const configString = Buffer.from(content).toString('utf8');
        return JSON.parse(configString) as QdrantOllamaConfig;
    } catch (e) {
        // Handle file not found or parsing errors
        return null;
    }
}
```

#### 3. Multi-Root Conflict Logic (P1.3)

Logic within the `WorkspaceManager` or `extension.ts` must iterate over `workspace.workspaceFolders` and check for configuration conflicts, utilizing `showWarningMessage` for user feedback.

```typescript
// src/services/WorkspaceManager.ts (Conceptual structure)
import * as vscode from 'vscode';

function checkWorkspaceIntegrity() {
    const folders = vscode.workspace.workspaceFolders;

    if (folders && folders.length > 1) {
        // Logic to compare configs across multiple folders (omitted for brevity)
        const conflictDetected = true; 
        
        if (conflictDetected) {
            void vscode.window.showWarningMessage(
                'Multiple repositories detected with differing configurations. A unified workspace index configuration is required.', 
                { modal: true }, 
                'Setup Multi-Repo Index' 
            );
        }
    }

    // Initialize configuration for each folder/workspace (e.g., initializeFromConfigurationFile pattern)
    // ...
}
```

#### 4. Host-Guest Communication Registration (P1.4)

The `WebviewController` receives messages and uses `postMessage` to respond or send updates.

```typescript
// src/webviews/WebviewController.ts (Simplified Host Listener implementation based on P1.4)
// This class implements the listener function for the webview.
private registerMessageHandlers(webview: vscode.Webview) {
    webview.onDidReceiveMessage(message => {
        // Message structure is expected to match IpcMessage
        switch (message.method) {
            case SearchCodeRequest.method:
                this.handleSearchRequest(message);
                break;
            // Handle other commands/requests here...
        }
    });
}

// Example of Host sending a Notification to the Guest (e.g., Indexing Service calling the Controller)
public sendStatusUpdate(params: DidChangeIndexStatusParams) {
    this._panel.webview.postMessage(
        DidChangeIndexStatusNotification.createMessage(params) // Assuming createMessage utility exists
    );
}
```

### Next Steps

The next phase involves fleshing out the UI implementation using Svelte and integrating the component library.

1.  **P2.1, P2.2:** Implement the **Svelte application** and the **Webview Provider** that loads this Svelte bundle, managing client-side routing.
2.  **P2.3, P2.4:** Develop the **Search Interface** and **Snippet Display** using Svelte and Bits UI components, implementing the client-side IPC logic to send requests and receive notifications for updates.
3.  **P3: Testing:** Use Vitest to write unit tests for the backend services (`ConfigService.ts` and `WorkspaceManager.ts`) developed in P1, specifically testing file reading and multi-root conflict detection.
4.  
## Structured Markdown Analysis: P2: Frontend UI Implementation (Svelte + Bits UI)

| Title | Structured Analysis for P2: Frontend UI Implementation |
| :--- | :--- |
| **Date** | 2024-06-25 |
| **Step Section** | P2: Frontend UI Implementation (Svelte + Bits UI) |

### Query Block: P2 Details

Phase 2 involves implementing the user-facing sidebar interface using Svelte and the Bits UI component library, focusing on proper hosting within the VS Code Webview environment, establishing client-side routing, and implementing the search and snippet display functionality.

### Per-File Findings Summary

| Path/File | Key Points | Configuration / Details |
| :--- | :--- | :--- |
| **`src/webviews/SearchWebviewProvider.ts`** | **P2.1:** Implements `WebviewViewProvider` interface. The `resolveWebviewView` method is responsible for generating the initial HTML structure. It must configure the Content Security Policy (CSP) and load the bundled Svelte application (`bundle.js`) and associated stylesheets. | Uses `vscode.window.registerWebviewViewProvider` in `extension.ts`. Must use `Webview.asWebviewUri` to securely map local paths (like the bundled JS file) to URIs loadable by the webview host. |
| **`src/webviews/index.html`** | **P2.1:** The foundational HTML document served by the Provider. It must include placeholders for the Svelte bundle and necessary CSS, and include the script call to `acquireVsCodeApi()` for IPC setup. | Requires inclusion of CSS (e.g., Fluent/VS Code styles) and the bundled Svelte `main.js` script, all referenced via URIs generated by the Host. |
| **`src/webviews/app/main.ts`** | **P2.2:** The TypeScript entry point for the Svelte application. It initializes the Svelte root component (`router.svelte`) and typically initializes the IPC client responsible for sending/receiving messages to/from the Extension Host. | Must include logic to instantiate the Svelte component and mount it to the DOM element within the Webview (`_target` in the conceptual framework). |
| **`src/webviews/app/router.svelte`** | **P2.2:** The top-level Svelte component handling client-side navigation. It conditionally renders the `Search.svelte` view or the `Configuration.svelte` view based on internal state (routing/state management). | Svelte applications utilize reactivity (e.g., Svelte 5 runes) for dynamic view switching. |
| **`src/webviews/app/views/Search.svelte`** | **P2.3:** Implements the primary search interface. It uses **Bits UI Command.Root** and **Command.Input** components for the search bar functionality, enabling filtering and keyboard navigation. | Search logic utilizes `bind:value` for search input state synchronization and IPC messaging (via `acquireVsCodeApi()`) to send search requests to the Extension Host (P1.4). |
| **`src/webviews/app/components/SnippetList.svelte`** | **P2.4:** Responsible for rendering the file snippets received as results. It utilizes Bits UI primitives, often employing the **child snippet** pattern for maximum flexibility and accessibility. Each result item must trigger a VS Code command to open the file location. | Renders data received from the Host via IPC Notifications. Snippet items must execute a command (`vscode.executeCommand()`) to reveal the file/line. |

### Data Structures

1.  **Svelte App State (`SearchAppState`):** Managed internally by Svelte's reactive system (e.g., `$state` or context providers). Must hold:
    *   `currentView`: ('Search' \| 'Config').
    *   `searchQuery`: string.
    *   `searchResults`: `FileSnippetResult[]` (results received from the Host).
    *   `indexStatus`: `string` (received via `DidChangeIndexStatusNotification`).

2.  **Webview Messaging API:** Relies on the structures defined in P1.1 (e.g., `SearchCodeRequest`, `DidChangeIndexStatusNotification`):
    *   **IpcRequest (Outgoing):** Used when the user submits a search query.
    *   **IpcNotification (Incoming):** Used by the Extension Host to push index status changes or deliver asynchronous search results.

### Methods and Arguments

| Package/API | Method | Purpose & Key Arguments |
| :--- | :--- | :--- |
| `vscode.window` | `registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider)` | **P2.1:** Registers the TypeScript class responsible for creating and populating the sidebar content. |
| `Webview` | `asWebviewUri(localResource: vscode.Uri)` | **P2.1:** Converts local disk URIs for the Svelte bundle, CSS, and images into secure URIs loadable within the webview iframe. |
| `window` (Guest/Webview) | `acquireVsCodeApi()` | **P2.1, P2.4:** Allows the Svelte frontend to acquire a reference to the VS Code API for message passing. This API exposes `postMessage` and state utilities. |
| `window` (Guest/Webview) | `addEventListener('message', ...)` | **P2.4:** The core mechanism for the Svelte client to listen for asynchronous state updates (`IpcNotification`) and search responses from the Extension Host. |
| `bits-ui/command` | `Command.Root`, `Command.Input` | **P2.3:** Components used to create the accessible search bar and manage filtering state. Supports `bind:value` for state synchronization. |
| `vscode.commands` | `executeCommand(command: string, ...args)` | **P2.4:** Used when a user clicks a snippet to open the corresponding file location in the editor (e.g., `vscode.open` command or similar navigation commands like `Go to Definition`). |

### Numbered Raw Output Sections with Code Snippets

#### 1. HTML Template Generation (P2.1)

The `SearchWebviewProvider.ts` uses a function to generate HTML, ensuring local resource security via `asWebviewUri` and implementing necessary IPC hooks.

```typescript
// src/webviews/SearchWebviewProvider.ts (Conceptual extract)
private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    // URI calculation for assets
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css')
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-...' 'unsafe-eval';">
        <link href="${styleUri.toString()}" rel="stylesheet">
        <title>Index Search</title>
    </head>
    <body>
        <div id="app"></div>
        <script>
            // Acquire VS Code API handle for message passing
            const vscode = acquireVsCodeApi(); 
        </script>
        <script nonce="...">${scriptUri.toString()}</script> 
    </body>
    </html>`;
}
```

#### 2. Search Interface Implementation (P2.3)

The `Search.svelte` view integrates Bits UI's Command component for an interactive search experience, providing features like dynamic filtering and keyboard navigation.

```svelte
<!-- src/webviews/app/views/Search.svelte -->
<script lang="ts">
    import * as Command from "bits-ui/command";
    import { SearchCodeRequest } from "../protocol"; // IPC Request
    
    let searchQuery = "";

    function handleSearch(query: string) {
        // Assume ipcClient handles messaging via acquireVsCodeApi()
        if (query) {
            ipcClient.request(SearchCodeRequest, { query }); 
        }
    }
</script>

<Command.Root>
    <Command.Input 
        placeholder="Search repository index..." 
        bind:value={searchQuery} 
        on:keydown={(e) => { 
            if (e.key === 'Enter') handleSearch(searchQuery); 
        }}
    />
    
    <Command.List class="max-h-[300px] overflow-y-auto">
        <!-- Loading and Empty States, provided by Bits UI -->
        <Command.Loading>Searching the index...</Command.Loading>
        <Command.Empty>No snippets found for "{searchQuery}"</Command.Empty>

        <!-- Dynamic results component -->
        <SnippetList {searchResults} /> 
    </Command.List>
</Command.Root>
```

#### 3. Snippet Display and Command Execution (P2.4)

The `SnippetList.svelte` iterates over results and must link user interaction (click) directly back to a VS Code command to navigate the editor.

```svelte
<!-- src/webviews/app/components/SnippetList.svelte -->
<script lang="ts">
    // Results structure imported from P1 protocol
    export let searchResults: FileSnippetResult[]; 
    
    // Function to execute VS Code command to open file/line
    function openFile(path: string, line: number) {
        // Assumes 'vscode' API handle is available globally/via context
        // Execute a generic command that opens the file and sets the cursor/selection
        vscode.postMessage({
            command: 'vscode.open', 
            args: [{ resource: path, options: { selection: { startLine: line } } }]
        });
    }
</script>

{#each searchResults as snippet (snippet.file_path)}
    <Command.Item 
        class="data-selected:bg-muted outline-hidden flex cursor-pointer"
        on:select={() => openFile(snippet.file_path, snippet.line_start)}
    >
        <div class="snippet-content">
            <span class="file-path">{snippet.file_path}:{snippet.line_start}</span>
            <pre class="code-preview">{snippet.snippet}</pre>
        </div>
    </Command.Item>
{/each}
```

### Next Steps

The completion of Phase 2 transitions development fully into testing and integration:

1.  **P3.1, P3.2 (Testing Backend):** Configure **Vitest** for unit/integration testing of the TS backend logic (P1), ensuring configuration parsing and multi-root conflict detection work correctly.
2.  **P3.3 (Testing Frontend):** Implement component tests for the Svelte/Bits UI views to verify rendering, reactivity, and IPC message handling.
3.  **P1.4 Integration:** Finalize the communication flow between the Svelte client (sending `SearchCodeRequest` from P2.3) and the TS controller (receiving the request and sending back results via `postMessage` Notification).
4.  
## Structured Markdown Analysis: P3: Testing and Finalization

| Title | Structured Analysis for P3: Testing and Finalization |
| :--- | :--- |
| **Date** | 2024-06-25 |
| **Step Section** | P3: Testing and Finalization |

### Query Block: P3 Details

Phase 3 finalizes the extension development by establishing a comprehensive testing infrastructure using Vitest for both backend TypeScript code and frontend Svelte components, and preparing the extension for publication via `vsce`.

### Per-File Findings Summary

| Path/File | Key Points | Configuration / Details |
| :--- | :--- | :--- |
| **`vitest.config.ts` (or `vite.config.ts`)** | **P3.1:** Central configuration for running tests. Must define inclusion patterns for both JS/TS tests and Svelte component tests. Must specify the testing environment. | Configuration examples show a `test` property that includes settings like `include: ["src/**/*.test.{js,ts}"]`, `globals: true`, and `environment: "jsdom"`. Using the `jsdom` environment is suitable for Svelte component tests requiring DOM interaction. |
| **`src/test/suite/config.test.ts`** | **P3.2:** Contains unit tests focusing on non-UI logic: configuration parsing (`ConfigService`) and multi-root conflict detection (`WorkspaceManager`). Mocking the `vscode` API is required for integration tests targeting extension activation. | Tests should follow the pattern `src/path/to/__tests__/file.test.ts` or similar co-located test structure. Extension tests use the `vscode` module and specific APIs, typically requiring a runner like `@vscode/test-electron` or `@vscode/test-cli`. |
| **`src/webviews/app/components/*.test.ts`** | **P3.3:** Contains component tests for Svelte UI elements (`Search.svelte`, `SnippetList.svelte`). Tests verify rendering, reactivity, and proper handling of component properties/events. | Uses Vitest in a DOM environment (`jsdom`). Should employ testing library utilities (like `@testing-library/svelte`, derived from best practice) to check accessibility and user flow. |
| **`package.json`** | **P3.4:** Must contain production build (`compile`), webview build (`build:webview`), test scripts (`test`), and packaging scripts (`package`). Packaging scripts often use `vsce`. | Should include `pnpm run package` (or equivalent) in CI/CD workflows. The `vscode:prepublish` script often orchestrates the necessary compilation steps before packaging. |
| **`.vscodeignore`** | **P3.4:** Critical file defining exclusion rules for the VSIX package. Must exclude source files, test files, and build artefacts (`node_modules`, `dist`, `out`, `coverage`). | Common exclusions include `**/coverage`, build artifacts like `.svelte-kit` and `.vercel`. Ignoring the build output directories is crucial (`out`, `.vscode-test`). If this file is missing, `vsce` issues a warning. |

### Data Structures

1.  **Vitest Configuration (`TestConfig`):**
    *   `test`: `{ environment: string; globals: boolean; include: string[]; ... }`.
2.  **Test Results:** Standard assertion results, possibly including errors or warnings captured during testing (e.g., Svelte compiler warnings: `css_unused_selector`).
3.  **VSIX Package Options (`IPackageOptions`):** Used by `vsce`.
    *   `packagePath`: string (the output path for the VSIX file).
    *   `preRelease`: boolean (if targeting pre-release channels).
    *   `ignoreFile`: string (specifying `.vscodeignore`).
    *   `dependencies`: boolean (often set to `false` when publishing, using `--no-dependencies` in CLI).

### Methods and Arguments

| Package/API | Method | Purpose & Key Arguments |
| :--- | :--- | :--- |
| `vitest` | `defineConfig({ test: { ... } })` | **P3.1:** Sets up Vitest runtime parameters, including environment (`jsdom`). |
| `@vscode/test-cli` | (Execution command) | **P3.2:** CLI utility used for running tests within a dedicated VS Code extension host environment. |
| `vscode` module (mocked) | `window.createStatusBarItem()` | **P3.2:** Used in integration tests (e.g., `config.test.ts`) to verify that extension activation successfully registers UI elements or commands. |
| `vsce` | `vsce publish` | **P3.4:** CLI command for publishing the extension. Arguments often include `--no-dependencies` and specifying the package path. |
| `pnpm` (or `npm`) | `run package` | **P3.4:** Script defined in `package.json` to trigger the final bundling process (P0.2) and prepare the `.vsix` file.

### Numbered Raw Output Sections with Code Snippets

#### 1. Vitest Configuration (P3.1)

Configuration structure needed for Vite/Vitest to support TS backend and Svelte frontend components, typically placed in `vite.config.ts` or `vitest.config.ts`.

```typescript
// vitest.config.ts (or inside vite.config.ts test property)
export default defineConfig({
    plugins: [
        // Ensure svelte plugin is included for .svelte file handling
        // vitePreprocess is crucial for compiling TS/Svelte files
    ],
    test: {
        // Includes both TS backend tests and Svelte component tests
        include: ["src/**/*.{test,spec}.{js,ts}", "src/webviews/**/*.test.{ts,js,svelte}"],
        
        // Use JSDOM for testing Svelte components requiring DOM APIs
        environment: "jsdom", 
        
        // Required for accessing Vitest global APIs without imports in test files
        globals: true,
        
        // Allows testing source files directly for in-source testing (if needed)
        includeSource: ["src/**/*.{js,ts,svelte}"],
        
        // Configuration for browser-based testing (if used instead of jsdom)
        // browser: { provider: playwright(), ... }
    },
});
```

#### 2. VS Code Integration Test Runner (P3.2)

Integration tests verify that the VS Code extension activates and registers components correctly.

```typescript
// Example test dependency setup for VS Code extensions
// Test files will be run via the @vscode/test-cli (or @vscode/test-electron) runner.
// The test configuration file defines the test runner setup:
export default defineConfig([
    { 
        label: 'Unit Tests', 
        files: 'out/tests/**/*.test.js', // Target compiled JS files 
        version: 'stable', 
        mocha: { 
            ui: 'tdd', 
            timeout: 20000, 
        }, 
    },
]); 
```

#### 3. Svelte Component Test Example (P3.3)

Conceptual snippet demonstrating a component test targeting reactivity, leveraging the DOM environment configured in P3.1.

```typescript
// src/webviews/app/components/SnippetList.test.ts (Conceptual)
import { assert, test } from 'vitest';
import SnippetList from './SnippetList.svelte';
import { render } from '@testing-library/svelte'; // Derived from best practice

test('SnippetList renders correct number of results', () => {
    const mockResults = [/*...*/];
    const { container } = render(SnippetList, { props: { searchResults: mockResults } });

    // Assert that the rendered list items match the input data
    assert.equal(container.querySelectorAll('li').length, mockResults.length); 
    // Further assertions check accessibility/correct content rendering (P2.4)
});
```

#### 4. Publishing Script and Exclusion (P3.4)

The process relies on `vsce` and strict file exclusion.

```json
// package.json scripts (extract)
"scripts": {
    "vscode:prepublish": "npm run compile && npm run build:webview",
    "package": "vsce package --out $NAME.vsix --no-dependencies",
    "publish:stable": "pnpm vsce publish --no-dependencies --packagePath ./$NAME.vsix -p $PAT"
}
```

The `.vscodeignore` file prevents unnecessary files from being packaged into the VSIX:

```
# .vscodeignore (Conceptual)
# Build output
dist/
out/
.svelte-kit/
.vercel/

# Dependencies and cache
**/node_modules
coverage
*.lcov
.eslintcache
.env*

# Source and Test files
src/**/*.test.ts
src/**/*.spec.ts
```
The file exclusion mechanism ensures dependencies are minimal and performance is maintained.

### Next Steps

Phase 3 marks the completion of the feature implementation and testing foundation. The final step involves executing the packaging and deployment process:

1.  **Final Build Verification:** Ensure `pnpm run compile` and `pnpm run build:webview` execute successfully and produce the expected bundled JavaScript files, critical for web environment compatibility.
2.  **Packaging (`vsce`):** Run the `vsce package` command, ensuring the `.vscodeignore` correctly excludes unnecessary files and the resulting VSIX package is correctly named and structured.
3.  **Documentation/Release:** Create release notes (analogous to the documented process) and proceed with publishing the extension to the Marketplace.