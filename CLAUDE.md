# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `mcp-semantic-watcher`, a Model Context Protocol (MCP) server that provides semantic code search capabilities. It watches a code repository, indexes code snippets using Ollama embeddings, and stores them in Qdrant vector database for natural language search.

## Key Architecture

### Core Components

- **SemanticWatcher Class** (`src/index.ts:149`): Main service class that orchestrates file watching, parsing, embedding generation, and vector storage
- **MCP Server** (`src/index.ts:577`): MCP protocol server exposing `semantic_search` and `refresh_index` tools
- **File Processing Pipeline**:
  1. File watching via Chokidar
  2. Content hashing for deduplication
  3. Tree-sitter parsing for structured code extraction
  4. Ollama embedding generation
  5. Qdrant vector storage
  6. SQLite caching for indexed file state

### Database Schema

SQLite cache (`mcp-cache.db`) tracks indexed files:
```sql
CREATE TABLE indexed_files (
  collection_name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  last_updated INTEGER,
  PRIMARY KEY (collection_name, repo_path, file_path)
)
```

### Language Support

Tree-sitter supports: TypeScript, TSX, JavaScript, JSX, Python, Java, Rust, Go, Kotlin. Falls back to line-based chunking for unsupported formats.

## Development Commands

```bash
# Install dependencies
npm install

# Download Tree-sitter WASM grammars (REQUIRED after first install)
npm run setup

# Build TypeScript
npm run build

# Start the server
npm start

# Development with auto-rebuild
npm run watch

# Run tests
npm test

# Run tests with coverage
npm run coverage

# Test Tree-sitter parser functionality
npm run test-parser
```

## External Dependencies

The server requires:
- **Qdrant**: Vector database (default: `http://localhost:6333`)
- **Ollama**: Embedding model service (default: `nomic-embed-text`)

## Configuration

Environment variables:
- `REPO_PATH`: Target repository to watch (default: `./target-repo`)
- `QDRANT_URL`: Qdrant instance URL
- `QDRANT_API_KEY`: Qdrant authentication key (optional)
- `QDRANT_COLLECTION`: Qdrant collection name (default: `codebase_context`)
- `OLLAMA_MODEL`: Embedding model name (default: `nomic-embed-text`)
- `WASM_PATH`: Tree-sitter WASM files location (default: `./wasm`)
- `LOG_PATH`: Directory for log files (default: `./logs`). Creates daily logs: `mcp-server-YYYY-MM-DD.log`
- `DB_PATH`: SQLite cache database path (default: `mcp-cache.db`)
- `MAX_FILE_SIZE`: Maximum file size to index (default: 1MB)
- `MIN_CHUNK_SIZE`: Minimum character length for code chunks (default: 50)
- `CHUNK_OVERLAP`: Line overlap between chunks (default: 10)
- `CHUNK_LINES`: Lines per chunk (default: 50)
- `VECTOR_SIZE`: Embedding dimension (default: 768)
- `SEARCH_LIMIT`: Default search result limit (default: 5)
- `LOG_LEVEL`: Logging verbosity (default: `info`)

## Testing

Tests are in `src/index.test.ts` and use Vitest with comprehensive mocking:
- External services (Qdrant, Ollama, file system) are mocked
- SQLite operations are mocked
- Tree-sitter parsing is mocked

Run tests with `npm test` or `npm run coverage` for coverage report.

## Key Implementation Details

### File Processing Logic
- Files are hashed and deduplicated against SQLite cache
- Large files (>1MB) are skipped
- Tree-sitter extracts meaningful code blocks (functions, classes, etc.)
- Fallback to line-based chunking with overlap (50 lines, 10 overlap)
- Content embeddings include file path and line numbers for context

### Search Functionality
- Query embedded using same Ollama model
- Vector similarity search in Qdrant
- Results formatted with file paths, line numbers, and similarity scores
- Default limit: 5 results, configurable via API

### Error Handling
- Graceful fallback when Tree-sitter grammars missing
- Robust file watching with error recovery
- External service failures logged but don't crash server