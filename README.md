[![CI Status](https://github.com/bramburn/mcp-fs-server/actions/workflows/ci.yml/badge.svg)](https://github.com/bramburn/mcp-fs-server/actions/workflows/ci.yml)


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

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.