This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
.gitignore
.repomixignore
CONTRIBUTING.md
GEMINI.md
LICENSE.md
package.json
README.md
repomix.config.json
scripts/setup-wasm.cjs
scripts/test-parser.cjs
src/index.test.ts
src/index.ts
tsconfig.json
vitest.config.ts
```

# Files

## File: .repomixignore
````
# Add patterns to ignore here, one per line
# Example:
# *.log
# tmp/
````

## File: CONTRIBUTING.md
````markdown
# Contributing to MCP Semantic Watcher

Thank you for considering contributing to the MCP Semantic Watcher project! We welcome your contributions, whether it's reporting bugs, suggesting features, or submitting code.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this Code of Conduct. Please read the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/0/CODE_OF_CONDUCT.html) for details.

## How to Contribute

### Reporting Bugs

If you find a bug, please report it by opening an issue on the GitHub repository.
When reporting a bug, please include:

*   A clear and concise title for the issue.
*   A detailed description of the bug, including the steps to reproduce it.
*   Information about your environment (OS, Node.js version, Qdrant/Ollama versions if relevant).
*   Any relevant error messages or logs.

### Suggesting Features or Improvements

We welcome feature requests and suggestions for improvement. Please open an issue on the GitHub repository to discuss your ideas.

### Submitting Pull Requests

We appreciate your code contributions! Here's the general workflow:

1.  **Fork the Repository:** Create your own fork of the `mcp-fs-server` repository.
2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/YOUR_USERNAME/mcp-fs-server.git
    cd mcp-fs-server
    ```
    (Replace `YOUR_USERNAME` with your GitHub username).
3.  **Create a New Branch:** Create a descriptive branch for your changes.
    ```bash
    git checkout -b feat/your-feature-name
    # or
    git checkout -b fix/your-bug-fix
    ```
4.  **Make Your Changes:** Implement your feature or fix your bug.
5.  **Test Your Changes:** Ensure that your changes do not break existing functionality and that any new code is adequately tested. If tests are missing for your changes, consider adding them.
6.  **Commit Your Changes:** Write clear, concise commit messages.
    ```bash
    git add .
    git commit -m "feat: Add new functionality for X"
    # or
    git commit -m "fix: Resolve issue with Y"
    ```
7.  **Push to Your Fork:**
    ```bash
    git push origin feat/your-feature-name
    ```
8.  **Open a Pull Request:** Go to the original `mcp-fs-server` repository on GitHub and open a new Pull Request from your fork and branch. Provide a clear description of your changes.

### Development Workflow

Follow these steps to set up the project for local development:

1.  **Prerequisites:**
    *   Node.js (v18+ recommended)
    *   npm or yarn
    *   Qdrant instance running
    *   Ollama running with a compatible embedding model

2.  **Clone and Install:**
    ```bash
    git clone <repository-url>
    cd mcp-fs-server
    npm install
    # or
    yarn install
    ```

3.  **Setup WASM:**
    Download necessary Tree-sitter WASM grammars.
    ```bash
    npm run setup
    # or
    yarn setup
    ```

4.  **Build and Run:**
    ```bash
    npm run build
    npm start
    ```
    For development, use watch mode:
    ```bash
    npm run watch
    ```

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
````

## File: LICENSE.md
````markdown
MIT License

Copyright (c) 2025 bramburn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
````

## File: README.md
````markdown
# MCP Semantic Watcher

This project provides an MCP server that watches a code repository, indexes code snippets using Ollama embeddings, and stores them in Qdrant for semantic search. It leverages Tree-sitter for parsing code structures and Chokidar for efficient file watching.

## Features

*   **Real-time Code Indexing:** Monitors a specified repository path for file changes.
*   **Semantic Search:** Indexes code snippets as embeddings using Ollama and allows searching via natural language queries.
*   **Code Parsing:** Utilizes Tree-sitter for structured parsing of supported programming languages.
*   **Qdrant Integration:** Stores embeddings and metadata in a Qdrant vector database.
*   **MCP Server:** Exposes tools for semantic search and index management via the Model Context Protocol.

## Setup and Installation

### Prerequisites

*   **Node.js:** Version 18 or higher is recommended.
*   **npm or yarn:** Package manager for Node.js.
*   **Qdrant:** A running Qdrant instance. The default URL is `http://localhost:6333`. Ensure it's accessible and configured if using authentication.
*   **Ollama:** Ollama must be installed and running, with a compatible embedding model downloaded (default: `nomic-embed-text`).

### Steps

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd mcp-fs-server
    ```

2.  **Install Node.js Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Download WASM Grammars:**
    This project uses Tree-sitter for parsing code. The necessary WASM grammar files need to be downloaded.
    ```bash
    npm run setup
    # or
    yarn setup
    ```
    This command executes `node scripts/wasm-installer.js` which downloads the required Tree-sitter WASM files into the `./wasm` directory.

4.  **Configure Environment Variables (Optional):**
    The server can be configured using environment variables. If not set, default values will be used. See the [Configuration](#configuration) section for details.

## Running the Server

1.  **Build the Project:**
    Compile the TypeScript code into JavaScript.
    ```bash
    npm run build
    # or
    yarn build
    ```

2.  **Start the Server:**
    Run the compiled application.
    ```bash
    npm start
    # or
    yarn start
    ```
    The server will start listening for MCP requests on STDIN/STDOUT.

3.  **Development Watch Mode:**
    To automatically recompile TypeScript on file changes during development:
    ```bash
    npm run watch
    # or
    yarn watch
    ```

## Usage

The server operates as an MCP service, communicating via STDIN/STDOUT. You can interact with it by sending MCP requests. The primary way to use this server is by calling the tools it exposes.

## Tools

The MCP Semantic Watcher exposes the following tools:

### `semantic_search`

*   **Description:** Searches the indexed codebase using semantic vector search. It finds code snippets semantically similar to your natural language query.
*   **Input Schema:**
    *   `query` (string, required): The natural language query to search for.
    *   `limit` (number, optional): The maximum number of results to return. Defaults to 5, with a maximum of 20.
*   **Output:** Returns a formatted string containing search results, including file path, line numbers, score, and the code snippet.

### `refresh_index`

*   **Description:** Manually triggers a full re-scan and re-indexing of the configured repository path (`REPO_PATH`). This is useful if new files are added or if you want to ensure the index is up-to-date.
*   **Input Schema:** None.
*   **Output:** A confirmation message indicating the refresh process has started or completed.

## Example Prompts (MCP Tool Calls)

These examples show how you might call the tools using an MCP request structure.

### Example: Semantic Search

To search for code related to "how to initialize the Qdrant client" and get up to 3 results:

```json
{
  "method": "call_tool",
  "params": {
    "name": "semantic_search",
    "arguments": {
      "query": "How is the Qdrant client initialized?",
      "limit": 3
    }
  }
}
```

### Example: Refresh Index

To manually trigger a re-scan of the repository:

```json
{
  "method": "call_tool",
  "params": {
    "name": "refresh_index",
    "arguments": {}
  }
}
```

## Configuration

The server's behavior can be customized using environment variables:

| Variable           | Description                                                                                             | Default Value         |
| :----------------- | :------------------------------------------------------------------------------------------------------ | :-------------------- |
| `QDRANT_URL`       | URL of the Qdrant instance.                                                                             | `http://localhost:6333` |
| `QDRANT_API_KEY`   | API key for Qdrant authentication.                                                                      | (None)                |
| `OLLAMA_MODEL`     | Name of the Ollama model for generating embeddings (e.g., `nomic-embed-text`).                          | `nomic-embed-text`    |
| `QDRANT_COLLECTION`| Name of the Qdrant collection to use for storing embeddings.                                            | `codebase_context`    |
| `REPO_PATH`        | Path to the code repository to watch and index.                                                         | `./target-repo`       |
| `WASM_PATH`        | Path to the directory containing Tree-sitter WASM grammars.                                             | `./wasm`              |
| `MAX_FILE_SIZE`    | Maximum file size in bytes to index (e.g., `1048576` for 1MB).                                          | `1048576`             |
| `MIN_CHUNK_SIZE`   | Minimum character length for a code chunk to be considered for indexing.                                | `50`                  |
| `CHUNK_OVERLAP`    | Number of lines to overlap between chunks when using simple line-based splitting.                       | `10`                  |
| `CHUNK_LINES`      | Number of lines per chunk when using simple line-based splitting.                                       | `50`                  |
| `VECTOR_SIZE`      | Dimension of the vectors stored in Qdrant. Must match the embedding model's output dimension.           | `768`                 |
| `SEARCH_LIMIT`     | Default number of results to return for semantic search queries.                                        | `5`                   |
| `LOG_LEVEL`        | Controls the verbosity of logs (`info`, `debug`, `warn`, `error`).                                    | `info`                |

## Contributing

(Placeholder for contribution guidelines)

## License

(Placeholder for license information)
````

## File: repomix.config.json
````json
{
  "$schema": "https://repomix.com/schemas/latest/schema.json",
  "input": {
    "maxFileSize": 52428800
  },
  "output": {
    "filePath": "repomix-output.md",
    "style": "markdown",
    "parsableStyle": false,
    "fileSummary": true,
    "directoryStructure": true,
    "files": true,
    "removeComments": false,
    "removeEmptyLines": false,
    "compress": false,
    "topFilesLength": 5,
    "showLineNumbers": false,
    "truncateBase64": false,
    "copyToClipboard": false,
    "includeFullDirectoryStructure": false,
    "tokenCountTree": false,
    "git": {
      "sortByChanges": true,
      "sortByChangesMaxCommits": 100,
      "includeDiffs": false,
      "includeLogs": false,
      "includeLogsCount": 50
    }
  },
  "include": [],
  "ignore": {
    "useGitignore": true,
    "useDefaultPatterns": true,
    "customPatterns": []
  },
  "security": {
    "enableSecurityCheck": true
  },
  "tokenCount": {
    "encoding": "o200k_base"
  }
}
````

## File: src/index.test.ts
````typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticWatcher } from './index.js';

// --- Mocks ---

// Mock fs/promises
vi.mock('fs/promises', async () => {
  return {
    default: {
      readFile: vi.fn(),
      stat: vi.fn(),
      access: vi.fn(),
      readdir: vi.fn(),
    }
  };
});

// Mock Chokidar
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
    }),
  },
}));

// Mock Better-SQLite3
const mockPrepare = vi.fn();
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      prepare: mockPrepare,
    })),
  };
});

// Mock Qdrant
const mockQdrantUpsert = vi.fn();
const mockQdrantSearch = vi.fn();
const mockQdrantGetCollections = vi.fn();
const mockQdrantCreateCollection = vi.fn();
const mockQdrantDelete = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: mockQdrantGetCollections,
    createCollection: mockQdrantCreateCollection,
    upsert: mockQdrantUpsert,
    search: mockQdrantSearch,
    delete: mockQdrantDelete,
  })),
}));

// Mock Ollama
vi.mock('ollama', () => ({
  default: {
    embeddings: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
  },
}));

// Mock Web-Tree-Sitter
vi.mock('web-tree-sitter', () => ({
  default: {
    init: vi.fn(),
    Language: {
      load: vi.fn().mockResolvedValue({
        query: vi.fn().mockReturnValue({
          captures: vi.fn().mockReturnValue([]), // Return empty captures by default
        }),
      }),
    },
  },
}));


import fs from 'fs/promises';

describe('SemanticWatcher', () => {
  let watcher: SemanticWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default SQLite mocks for every test
    mockPrepare.mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
    });

    watcher = new SemanticWatcher();
  });

  describe('Initialization', () => {
    it('should initialize Qdrant collection if not exists', async () => {
      // Mock Qdrant returning empty collections
      mockQdrantGetCollections.mockResolvedValue({ collections: [] });

      await watcher.init();

      expect(mockQdrantCreateCollection).toHaveBeenCalled();
    });

    it('should NOT create Qdrant collection if it exists', async () => {
      // Mock Qdrant returning existing collection
      mockQdrantGetCollections.mockResolvedValue({ 
        collections: [{ name: 'codebase_context' }] 
      });

      await watcher.init();

      expect(mockQdrantCreateCollection).not.toHaveBeenCalled();
    });
  });

  describe('File Handling', () => {
    it('should skip large files', async () => {
      // Mock file stat to be large (2MB)
      vi.mocked(fs.stat).mockResolvedValue({ size: 2 * 1024 * 1024 } as any);
      
      await watcher.handleFileChange('large_file.ts');

      // Should not read file content
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should process new files', async () => {
      // Mock file system
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue('function test() {}');
      
      // Mock DB to return null (file not indexed yet)
      mockPrepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn().mockReturnValue(null), 
      });

      await watcher.handleFileChange('new_file.ts');

      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('new_file.ts'), 'utf-8');
      expect(mockQdrantUpsert).toHaveBeenCalled();
    });

    it('should skip unchanged files (Deduplication)', async () => {
      const content = 'function test() {}';
      // Mock file system
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue(content);

      // Calculate what the hash would be
      const crypto = await import('crypto');
      const hash = crypto.createHash('md5').update(content).digest('hex');

      // Mock DB to return the SAME hash
      mockPrepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn().mockReturnValue({ content_hash: hash }), 
      });

      await watcher.handleFileChange('existing_file.ts');

      // Should read file to calc hash, but NOT upsert to Qdrant
      expect(fs.readFile).toHaveBeenCalled();
      expect(mockQdrantUpsert).not.toHaveBeenCalled();
    });
  });
  
  describe('Search', () => {
    it('should return formatted results', async () => {
      mockQdrantSearch.mockResolvedValue([
        {
          score: 0.9,
          payload: {
            filePath: 'test.ts',
            startLine: 1,
            endLine: 5,
            content: 'function test() {}'
          }
        }
      ]);

      const result = await watcher.search('test query');
      
      expect(result).toContain('Path: test.ts');
      expect(result).toContain('Score: 0.9000');
    });
  });
});
````

## File: vitest.config.ts
````typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'scripts/**', 'build/**']
    },
    // We mock these modules because they rely on external services/files
    server: {
      deps: {
        inline: ['web-tree-sitter'] 
      }
    }
  },
});
````

## File: GEMINI.md
````markdown
# GEMINI.md

This file provides context about the `mcp-fs-server` project for AI agent interactions.

## Project Overview

The `mcp-fs-server` project is a Node.js application designed to act as an MCP (Model Context Protocol) server. Its primary functions include semantic search and file watching, leveraging technologies like Qdrant for vector search, Ollama for language model interactions, and `chokidar` for monitoring file system changes. The project is built using TypeScript.

## Project Type

This is a **Code Project** (Node.js).

## Environment Information

*   **Operating System:** Windows (`win32`)
*   **Runtime:** Node.js (Specific version not determined from available files)
*   **CLI Tools:** `npm`/`yarn`, `gh cli`, `git`, `typescript` (`tsc`)
*   **Development Directory:** `C:\dev\mcp-fs-server`

## Technologies Used

*   **Runtime:** Node.js
*   **Language:** TypeScript
*   **Core Libraries:**
    *   `@modelcontextprotocol/sdk`: For Model Context Protocol interactions.
    *   `@qdrant/js-client-rest`: For interacting with Qdrant vector database.
    *   `chokidar`: For efficient file watching.
    *   `web-tree-sitter`: For parsing code or text structures.
    *   `ollama`: For integrating with Ollama language models.
    *   `zod`: For data validation.
    *   `glob`: For file path pattern matching.
    *   `crypto`: For cryptographic operations.
*   **Build Tools:** `typescript` (via `tsc`)

## Building and Running

The project uses `npm` (or `yarn`) for package management and script execution.

*   **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

*   **Build Project:** Compiles TypeScript code to JavaScript.
    ```bash
    npm run build
    # or
    yarn build
    ```

*   **Run Application:** Starts the server after building.
    ```bash
    npm start
    # or
    yarn start
    ```

*   **Setup WASM:** Installs WASM-related dependencies.
    ```bash
    npm run setup
    # or
    yarn setup
    ```

*   **Development Watch Mode:** Compiles TypeScript on file changes.
    ```bash
    npm run watch
    # or
    yarn watch
    ```

## Development Conventions

*   **Language:** TypeScript is used for development.
*   **Package Management:** `npm` is used, as indicated by `package.json` and `package-lock.json`.
*   **File Structure:** Standard Node.js project structure with a `scripts` directory for utility scripts and a `build` directory for compiled output.
*   **`.gitignore`:** The `.gitignore` file is present and configured to ignore `node_modules/`.

## Key Files

*   `package.json`: Defines project metadata, dependencies, and scripts for building, running, and watching.
*   `package-lock.json`: Locks dependency versions for reproducible builds.
*   `tsconfig.json` (Assumed, not explicitly read but implied by `tsc` usage): Configuration for the TypeScript compiler.
*   `scripts/wasm-installer.js`: A script likely used for setting up WebAssembly dependencies.
*   `.gitignore`: Configures which files and directories Git should ignore (e.g., `node_modules/`).
*   `GEMINI.md`: This file, providing context for AI interactions.
*   `build/index.js` (Output of build): The main entry point for the application after compilation.
*   `src/` (Assumed, not explicitly read but implied by `build/index.js` and `tsc` usage): Contains the TypeScript source code.
*   `.qodo/`: Directory present, likely for AI agent configurations or workflows.
*   `wasm/`: Directory present, likely related to WebAssembly.

## Data Structure

*   **Schema Definition:** The project utilizes `zod` for data validation and schema definition, implying structured data across the application, though specific schema files were not read.
*   **Vector Storage:** The use of `@qdrant/js-client-rest` indicates that data is likely stored and queried as vectors in Qdrant, with associated metadata payloads.
*   **Context Management:** `@modelcontextprotocol/sdk` suggests the handling of model context, which may involve specific data structures for managing conversational or processing history.

## Architecture Notes

The server appears to integrate file system monitoring with semantic analysis capabilities, likely for indexing or searching content. The use of Qdrant suggests a focus on efficient similarity search for embeddings generated by Ollama or other models.

The architecture likely involves:
1.  **File Watching:** `chokidar` monitors changes in specified directories.
2.  **Processing:** Detected file content may be processed by `ollama` for embeddings or other NLP tasks.
3.  **Storage/Retrieval:** Embeddings and associated data are stored in Qdrant for efficient semantic search.
4.  **SDK Integration:** `@modelcontextprotocol/sdk` is used to manage context or interact with other services.
5.  **Build Process:** TypeScript code is compiled to JavaScript in the `build/` directory.
````

## File: scripts/setup-wasm.cjs
````
const fs = require('fs');
const path = require('path');
const https = require('https');

const WASM_DIR = path.join(__dirname, '../wasm');

// Ensure wasm directory exists
if (!fs.existsSync(WASM_DIR)) {
    fs.mkdirSync(WASM_DIR);
    console.log(`Created directory: ${WASM_DIR}`);
}

// 1. Copy main tree-sitter.wasm from node_modules
const copyMainWasm = () => {
    const source = path.join(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm');
    const dest = path.join(WASM_DIR, 'tree-sitter.wasm');
    
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log('✅ Copied tree-sitter.wasm from node_modules');
    } else {
        console.error('❌ Could not find tree-sitter.wasm in node_modules. Did you run npm install?');
    }
};

// 2. Download Language Grammars (with Relative Redirect Support)
const downloadFile = (inputUrl, dest, language) => {
    return new Promise((resolve, reject) => {
        const request = https.get(inputUrl, (response) => {
            // Handle Redirects (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(response.statusCode)) {
                if (response.headers.location) {
                    // RESOLVE RELATIVE URLS HERE
                    const newUrl = new URL(response.headers.location, inputUrl).toString();
                    
                    downloadFile(newUrl, dest, language)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${language} (Status: ${response.statusCode}) from ${inputUrl}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded ${language}`);
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(dest, () => {}); 
                reject(err);
            });
        });
        
        request.on('error', (err) => {
             reject(err);
        });
    });
};

const downloadLanguage = async (language) => {
    const filename = `tree-sitter-${language}.wasm`;
    const url = `https://unpkg.com/tree-sitter-wasms/out/tree-sitter-${language}.wasm`;
    const dest = path.join(WASM_DIR, filename);

    console.log(`⬇️  Downloading ${language}...`);
    
    try {
        await downloadFile(url, dest, language);
    } catch (error) {
        console.error(`❌ Error downloading ${language}: ${error.message}`);
    }
};

// Run Main
(async () => {
    try {
        copyMainWasm();

        // Standard Web
        await downloadLanguage('typescript');
        await downloadLanguage('tsx');
        await downloadLanguage('javascript');

        // Backend
        await downloadLanguage('python');
        await downloadLanguage('java');
        await downloadLanguage('rust');
        await downloadLanguage('go'); 
        
        await downloadLanguage('kotlin'); 
    } catch (e) {
        console.error("Setup failed:", e);
    }
})();
````

## File: scripts/test-parser.cjs
````
const Parser = require('web-tree-sitter');
const path = require('path');
const fs = require('fs');

// Path to your WASM folder
const WASM_DIR = path.join(__dirname, '../wasm');

// Same mappings as src/index.ts to ensure consistency
const LANGUAGES = {
  ts: { lang: "typescript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface" },
  tsx: { lang: "tsx", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface" },
  js: { lang: "javascript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class" },
  jsx: { lang: "javascript", query: "(function_declaration) @func (method_definition) @method (class_declaration) @class" },
  py: { lang: "python", query: "(function_definition) @func (class_definition) @class" },
  java: { lang: "java", query: "(class_declaration) @class (method_declaration) @method (interface_declaration) @interface" },
  rs: { lang: "rust", query: "(function_item) @func (struct_item) @struct (trait_item) @trait (impl_item) @impl" },
  go: { lang: "go", query: "(function_declaration) @func (method_declaration) @method (type_declaration) @type" },
  kt: { lang: "kotlin", query: "(class_declaration) @class (function_declaration) @func" },
  dart: { lang: "dart", query: "(class_definition) @class (function_signature) @func" },
};

async function testParser() {
    // 1. Get file from args
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Please provide a file path.");
        console.error("Usage: node scripts/test-parser.cjs <path-to-file>");
        process.exit(1);
    }

    const fullPath = path.resolve(targetFile);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        process.exit(1);
    }

    // 2. Detect Language
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const config = LANGUAGES[ext];

    if (!config) {
        console.error(`No parser configuration found for extension: .${ext}`);
        process.exit(1);
    }

    console.log(`\n📄 Analyzing: ${path.basename(fullPath)}`);
    console.log(`🔧 Language: ${config.lang}`);

    // 3. Init Parser
    try {
        await Parser.init({
            locateFile(scriptName) {
                return path.join(WASM_DIR, scriptName);
            },
        });

        const parser = new Parser();
        const langFile = path.join(WASM_DIR, `tree-sitter-${config.lang}.wasm`);

        if (!fs.existsSync(langFile)) {
            console.error(`❌ Language WASM not found at: ${langFile}`);
            console.error(`   Run 'npm run setup' to download it.`);
            process.exit(1);
        }

        const Lang = await Parser.Language.load(langFile);
        parser.setLanguage(Lang);

        // 4. Parse Content
        const content = fs.readFileSync(fullPath, 'utf8');
        const tree = parser.parse(content);

        // 5. Run Query
        const query = Lang.query(config.query);
        const captures = query.captures(tree.rootNode);

        console.log(`🔍 Found ${captures.length} structural elements:\n`);
        console.log("---------------------------------------------------");
        console.log("| Line  | Type      | Signature                   ");
        console.log("---------------------------------------------------");

        let lastIndex = 0;

        captures.forEach(capture => {
            const node = capture.node;
            const type = capture.name; // e.g., 'func', 'class'
            
            // Get the first line of text for the signature preview
            const signature = node.text.split('\n')[0].substring(0, 40).replace(/\s+/g, ' ');

            // 1-based line number
            const startLine = node.startPosition.row + 1;
            
            console.log(`| ${startLine.toString().padEnd(5)} | ${type.padEnd(9)} | ${signature}...`);
        });
        console.log("---------------------------------------------------\n");

    } catch (e) {
        console.error("Parsing failed:", e);
    }
}

testParser();
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
````

## File: .gitignore
````
node_modules
dist
build
coverage
test-results
.env
.DS_Store
*.log
mcp-cache.db
wasm/
````

## File: src/index.ts
````typescript
#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { QdrantClient } from "@qdrant/js-client-rest";
import chokidar from "chokidar";
import Parser from "web-tree-sitter";
import ollama from "ollama";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";

// --- Type Definitions ---
interface QdrantCollectionDescription {
  name: string;
  config?: {
    params?: {
      vectors?: {
        size: number;
        distance: string;
      };
    };
  };
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: {
    content: string;
    filePath: string;
    startLine: number;
    endLine: number;
    fullContext: string;
  };
}

interface EmbeddingResponse {
  embedding: number[];
}

// --- Configuration ---
const CONFIG = {
  qdrantUrl: process.env.QDRANT_URL || "http://localhost:6333",
  qdrantApiKey: process.env.QDRANT_API_KEY,
  ollamaModel: process.env.OLLAMA_MODEL || "nomic-embed-text",
  collectionName: process.env.QDRANT_COLLECTION || "codebase_context",
  repoPath: process.env.REPO_PATH || "./target-repo",
  wasmPath: process.env.WASM_PATH || "./wasm",
  dbPath: process.env.DB_PATH || "mcp-cache.db",
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "1048576"), // 1MB default
  minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE || "50"),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || "10"),
  chunkLines: parseInt(process.env.CHUNK_LINES || "50"),
  vectorSize: parseInt(process.env.VECTOR_SIZE || "768"),
  searchLimit: parseInt(process.env.SEARCH_LIMIT || "5"),
  logLevel: process.env.LOG_LEVEL || "info",
};

// --- Logger Utility ---
const logger = {
  info: (message: string, ...args: any[]) => {
    if (CONFIG.logLevel === "info" || CONFIG.logLevel === "debug") {
      console.error(`[MCP-INFO] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[MCP-ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (CONFIG.logLevel === "debug") {
      console.error(`[MCP-DEBUG] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    console.error(`[MCP-WARN] ${message}`, ...args);
  },
};

// --- Language Definitions ---
const LANGUAGES: Record<string, { lang: string; query: string }> = {
  ts: {
    lang: "typescript",
    query:
      "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface",
  },
  tsx: {
    lang: "tsx",
    query:
      "(function_declaration) @func (method_definition) @method (class_declaration) @class (interface_declaration) @interface",
  },
  js: {
    lang: "javascript",
    query:
      "(function_declaration) @func (method_definition) @method (class_declaration) @class",
  },
  jsx: {
    lang: "javascript",
    query:
      "(function_declaration) @func (method_definition) @method (class_declaration) @class",
  },
  py: {
    lang: "python",
    query: "(function_definition) @func (class_definition) @class",
  },
  java: {
    lang: "java",
    query:
      "(class_declaration) @class (method_declaration) @method (interface_declaration) @interface",
  },
  rs: {
    lang: "rust",
    query:
      "(function_item) @func (struct_item) @struct (trait_item) @trait (impl_item) @impl",
  },
  go: {
    lang: "go",
    query:
      "(function_declaration) @func (method_declaration) @method (type_declaration) @type",
  },
  kt: {
    lang: "kotlin",
    query: "(class_declaration) @class (function_declaration) @func",
  },
  dart: {
    lang: "dart",
    query: "(class_definition) @class (function_signature) @func",
  },
};

// --- Interfaces ---
interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

// --- Logic Class ---
class SemanticWatcher {
  private qdrant: QdrantClient;
  private parser: Parser | null = null;
  private parsers: Record<string, Parser.Language> = {};
  private db: Database.Database;

  constructor() {
    this.qdrant = new QdrantClient({
      url: CONFIG.qdrantUrl,
      apiKey: CONFIG.qdrantApiKey,
    });

    // Initialize SQLite Database
    this.db = new Database(CONFIG.dbPath);
    this.initDB();
  }

  private initDB() {
    // Create table to track indexed files
    // Schema includes collection_name to prevent "split brain" if you switch indexes
    const stmt = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        collection_name TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        last_updated INTEGER,
        PRIMARY KEY (collection_name, repo_path, file_path)
      )
    `);
    stmt.run();
    logger.info(`SQLite cache initialized at ${CONFIG.dbPath}`);
  }

  async init() {
    logger.info("Initializing Semantic Watcher...");

    // 1. Init Tree Sitter (WASM)
    try {
      await Parser.init({
        locateFile(scriptName: string, scriptDirectory: string) {
          const resolvedPath = path.resolve(CONFIG.wasmPath, scriptName);
          logger.debug(`Loading WASM: ${resolvedPath}`);
          return resolvedPath;
        },
      });
      this.parser = new Parser();

      const uniqueLangs = new Set(Object.values(LANGUAGES).map((l) => l.lang));
      logger.info(`Loading ${uniqueLangs.size} language grammars...`);

      for (const langName of uniqueLangs) {
        const langPath = path.resolve(
          CONFIG.wasmPath,
          `tree-sitter-${langName}.wasm`
        );
        try {
          await fs.access(langPath);
          const lang = await Parser.Language.load(langPath);
          this.parsers[langName] = lang;
          logger.info(`Loaded grammar: ${langName}`);
        } catch (e) {
          logger.warn(
            `Skipped grammar ${langName} (not found in ${CONFIG.wasmPath})`
          );
        }
      }
    } catch (e) {
      logger.error("Failed to init Tree Sitter:", e);
    }

    // 2. Init Qdrant Collection
    try {
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.find(
        (c: any) => c.name === CONFIG.collectionName
      );

      if (!exists) {
        await this.qdrant.createCollection(CONFIG.collectionName, {
          vectors: {
            size: CONFIG.vectorSize,
            distance: "Cosine",
          },
        });
        logger.info(
          `Created Qdrant collection: ${CONFIG.collectionName} (size: ${CONFIG.vectorSize})`
        );
      } else {
        logger.info(
          `Using existing Qdrant collection: ${CONFIG.collectionName}`
        );
      }
    } catch (e) {
      logger.error("Qdrant connection error. Ensure Qdrant is running.", e);
    }

    // 3. Start Watcher
    this.startWatcher();
  }

  private startWatcher() {
    logger.info(`Watching directory: ${CONFIG.repoPath}`);

    const watcher = chokidar.watch(CONFIG.repoPath, {
      ignored: /(^|[\]\/])\..|node_modules|dist|build|target|\.git/,
      persistent: true,
      ignoreInitial: false,
    });

    watcher
      .on("add", (path) => this.handleFileChange(path))
      .on("change", (path) => this.handleFileChange(path))
      .on("unlink", (path) => this.handleFileDelete(path))
      .on("error", (error) => logger.error("Watcher error:", error));
  }

  private getHash(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
  }

  // --- SQLite Helper Methods ---

  private getStoredHash(relativePath: string): string | null {
    const absRepoPath = path.resolve(CONFIG.repoPath);
    const stmt = this.db.prepare(`
      SELECT content_hash FROM indexed_files 
      WHERE collection_name = ? AND repo_path = ? AND file_path = ?
    `);
    const result = stmt.get(
      CONFIG.collectionName,
      absRepoPath,
      relativePath
    ) as { content_hash: string } | undefined;
    return result ? result.content_hash : null;
  }

  private updateStoredHash(relativePath: string, hash: string) {
    const absRepoPath = path.resolve(CONFIG.repoPath);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO indexed_files (collection_name, repo_path, file_path, content_hash, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      CONFIG.collectionName,
      absRepoPath,
      relativePath,
      hash,
      Date.now()
    );
  }

  private deleteStoredHash(relativePath: string) {
    const absRepoPath = path.resolve(CONFIG.repoPath);
    const stmt = this.db.prepare(`
      DELETE FROM indexed_files 
      WHERE collection_name = ? AND repo_path = ? AND file_path = ?
    `);
    stmt.run(CONFIG.collectionName, absRepoPath, relativePath);
  }

  // --- File Handling ---

  async handleFileChange(filePath: string) {
    try {
      const fullPath = path.resolve(filePath);
      const relativePath = path.relative(CONFIG.repoPath, filePath);

      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > CONFIG.maxFileSize) {
          logger.debug(
            `Skipping large file: ${relativePath} (${stats.size} bytes)`
          );
          return;
        }
      } catch (e) {
        return; // File deleted between watch event and stat call
      }

      const content = await fs.readFile(fullPath, "utf-8");

      // 1. GENERATE HASH
      const currentHash = this.getHash(content);

      // 2. CHECK DB STATE (Deduplication)
      const lastHash = this.getStoredHash(relativePath);

      if (lastHash === currentHash) {
        // logger.debug(`Skipping unchanged file: ${relativePath}`);
        return;
      }

      logger.info(`Processing: ${relativePath}`);

      await this.handleFileDelete(filePath); // Clean old entries before re-indexing
      const chunks = await this.splitCode(relativePath, content);
      const points: any[] = [];

      for (const chunk of chunks) {
        try {
          const embeddingResponse = await ollama.embeddings({
            model: CONFIG.ollamaModel,
            prompt: `File: ${chunk.filePath}\nLines: ${chunk.startLine}-${chunk.endLine}\n\n${chunk.content}`,
          });

          points.push({
            id: chunk.id,
            vector: (embeddingResponse as EmbeddingResponse).embedding,
            payload: {
              content: chunk.content,
              filePath: chunk.filePath,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              fullContext: `File: ${chunk.filePath} (${chunk.startLine}-${chunk.endLine})\n${chunk.content}`,
            },
          });
        } catch (err) {
          logger.error(`Ollama error for ${chunk.filePath}:`, err);
        }
      }

      if (points.length > 0) {
        await this.qdrant.upsert(CONFIG.collectionName, {
          wait: true,
          points: points,
        });
      }

      // 3. UPDATE DB STATE
      this.updateStoredHash(relativePath, currentHash);
      logger.info(`Indexed ${chunks.length} chunks for ${relativePath}`);
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
  }

  async handleFileDelete(filePath: string) {
    const relativePath = path.relative(CONFIG.repoPath, filePath);

    // Remove from DB
    this.deleteStoredHash(relativePath);

    try {
      await this.qdrant.delete(CONFIG.collectionName, {
        filter: {
          must: [
            {
              key: "filePath",
              match: {
                value: relativePath,
              },
            },
          ],
        },
      });
      logger.debug(`Deleted vectors for: ${relativePath}`);
    } catch (e) {
      logger.warn(`Failed to delete vectors for ${relativePath}:`, e);
    }
  }

  async splitCode(filePath: string, content: string): Promise<CodeChunk[]> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const chunks: CodeChunk[] = [];
    const config = LANGUAGES[ext];

    if (this.parser && config && this.parsers[config.lang]) {
      try {
        this.parser.setLanguage(this.parsers[config.lang]);
        const tree = this.parser.parse(content);

        const query = this.parsers[config.lang].query(config.query);
        const captures = query.captures(tree.rootNode);

        let lastIndex = 0;

        for (const capture of captures) {
          const node = capture.node;
          if (node.startIndex < lastIndex) continue; // Prevent overlapping

          const chunkContent = node.text;
          if (chunkContent.length < CONFIG.minChunkSize) continue;

          const id = crypto
            .createHash("md5")
            .update(`${filePath}:${node.startIndex}`)
            .digest("hex");

          chunks.push({
            id: id,
            filePath,
            startLine: node.startPosition.row + 1, // Tree-sitter rows are 0-indexed
            endLine: node.endPosition.row + 1,
            content: chunkContent,
            contentHash: this.getHash(chunkContent),
          });

          lastIndex = node.endIndex;
        }
      } catch (e) {
        logger.debug(
          `Tree-sitter query failed for ${filePath}, falling back to lines.`,
          e
        );
      }
    }

    // If no chunks were generated by Tree-sitter, use line-based split
    if (chunks.length === 0) {
      return this.simpleSplit(filePath, content);
    }

    return chunks;
  }

  // Simple line-based chunking with overlap
  private simpleSplit(filePath: string, content: string): CodeChunk[] {
    const lines = content.split("\n");
    const chunkSize = CONFIG.chunkLines;
    const overlap = CONFIG.chunkOverlap;
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < lines.length; i += chunkSize - overlap) {
      const end = Math.min(i + chunkSize, lines.length);
      const chunkLines = lines.slice(i, end);
      const chunkText = chunkLines.join("\n");

      if (chunkText.trim().length < 10) continue;

      const id = crypto
        .createHash("md5")
        .update(`${filePath}:${i}`)
        .digest("hex");

      chunks.push({
        id,
        filePath,
        startLine: i + 1, // 1-indexed line numbers
        endLine: end,
        content: chunkText,
        contentHash: this.getHash(chunkText),
      });
    }
    return chunks;
  }

  async search(query: string, limit?: number) {
    const searchLimit = limit || CONFIG.searchLimit;

    const embeddingResponse = await ollama.embeddings({
      model: CONFIG.ollamaModel,
      prompt: query,
    });

    const searchResults = await this.qdrant.search(CONFIG.collectionName, {
      vector: (embeddingResponse as EmbeddingResponse).embedding,
      limit: searchLimit,
      with_payload: true,
    });

    return searchResults
      .map((res: any) => {
        const payload = res.payload;
        return `Path: ${payload.filePath}\nLines: ${payload.startLine}-${
          payload.endLine
        }\nScore: ${res.score.toFixed(4)}\n\n${payload.content}\n---`;
      })
      .join("\n");
  }

  // Add a new method for refreshing the index
  async refreshIndex(): Promise<void> {
    logger.info("Refreshing index...");
    // We do NOT clear the DB here. We let handleFileChange check hashes against the DB.
    // This allows for a fast "sync" rather than a destructive "rebuild".

    // Re-scan all files in the repository
    const files = await this.getAllFiles();
    logger.info(`Found ${files.length} files to scan`);

    for (const file of files) {
      await this.handleFileChange(file);
    }

    logger.info("Index refresh completed");
  }

  // Helper method to get all files recursively
  private async getAllFiles(dir: string = CONFIG.repoPath): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and common ignore patterns
          if (
            !entry.name.startsWith(".") &&
            !["node_modules", "dist", "build", "target", ".git"].includes(
              entry.name
            )
          ) {
            files.push(...(await this.getAllFiles(fullPath)));
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      logger.warn(`Error reading directory ${dir}:`, e);
    }

    return files;
  }
}
export { SemanticWatcher, CONFIG };

// --- Main Execution ---

// Only run the server if this file is the main module (not imported by tests)
import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const watcherService = new SemanticWatcher();
  const server = new Server(
    {
      name: "mcp-semantic-watcher",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "semantic_search",
          description: "Search the codebase using semantic vector search.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return",
                minimum: 1,
                maximum: 20,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "refresh_index",
          description: "Manually triggers a re-scan of the repository.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "semantic_search") {
      const query = args?.query as string;
      const limit = args?.limit as number | undefined;

      if (!query) {
        throw new Error("Query is required");
      }

      try {
        const results = await watcherService.search(query, limit);
        return {
          content: [{ type: "text", text: results }],
        };
      } catch (e: any) {
        console.error(`[MCP-ERROR] Search error:`, e);
        return {
          content: [{ type: "text", text: `Error searching: ${e.message}` }],
        };
      }
    }

    if (name === "refresh_index") {
      try {
        await watcherService.refreshIndex();
        return {
          content: [
            { type: "text", text: "Index refresh completed successfully." },
          ],
        };
      } catch (e: any) {
        console.error(`[MCP-ERROR] Refresh index error:`, e);
        return {
          content: [
            { type: "text", text: `Error refreshing index: ${e.message}` },
          ],
        };
      }
    }

    throw new Error(`Tool ${name} not found`);
  });

  async function run() {
    await watcherService.init();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP-INFO] MCP Semantic Watcher Server running on stdio");
  }

  run().catch((error) => {
    console.error("[MCP-ERROR] Fatal error:", error);
    process.exit(1);
  });
}
````

## File: package.json
````json
{
  "name": "mcp-semantic-watcher",
  "version": "1.0.0",
  "description": "MCP server with Qdrant vector search and file watching",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "watch": "tsc --watch",
    "setup": "node scripts/setup-wasm.cjs",
    "test-parser": "node scripts/test-parser.cjs",
    "test": "vitest",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.1",
    "@qdrant/js-client-rest": "^1.11.0",
    "better-sqlite3": "^11.5.0",
    "chokidar": "^4.0.1",
    "web-tree-sitter": "^0.22.6",
    "ollama": "^0.5.9",
    "zod": "^3.23.8",
    "glob": "^11.0.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5",
    "@vitest/coverage-v8": "^2.1.5"
  }
}
````
