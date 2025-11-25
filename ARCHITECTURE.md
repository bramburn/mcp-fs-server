# ARCHITECTURE.md

This document describes the architecture and components of the MCP Semantic Watcher project.

## High-Level Overview

The MCP Semantic Watcher is a Model Context Protocol (MCP) server that provides semantic code search capabilities. It continuously monitors a code repository, extracts meaningful code structures, generates embeddings using Ollama, and stores them in Qdrant vector database for efficient semantic search.

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   File System   │    │  Tree-sitter     │    │     Ollama      │
│                 │    │                  │    │                 │
│  - Source Code  │───▶│  - Code Parsing  │───▶│  - Embeddings   │
│  - Text Files   │    │  - AST Queries   │    │  - Vector Gen   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chokidar      │    │   SQLite Cache   │    │    Qdrant       │
│                 │    │                  │    │                 │
│  - File Watcher │    │  - Deduplication │    │  - Vector Store │
│  - Change Events│    │  - File Tracking │    │  - Similarity   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌──────────────────┐
                    │   MCP Server     │
                    │                  │
                    │  - semantic_search
                    │  - refresh_index  │
                    └──────────────────┘
```

## Core Components

### 1. SemanticWatcher Class (`src/index.ts:149`)

The main service class that orchestrates the entire indexing and search pipeline.

**Key Responsibilities:**
- Initialize and manage all external services (Qdrant, Ollama, Tree-sitter)
- Handle file system watching and change events
- Coordinate code parsing, embedding generation, and vector storage
- Manage SQLite cache for deduplication
- Implement semantic search functionality

**State Management:**
```typescript
class SemanticWatcher {
  private qdrant: QdrantClient;           // Vector database client
  private parser: Parser | null = null;   // Tree-sitter parser
  private parsers: Record<string, Parser.Language> = {}; // Language parsers
  private db: Database.Database;          // SQLite cache
}
```

### 2. File Processing Pipeline

The pipeline processes source files through multiple stages:

1. **File Discovery** (`src/index.ts:250-264`)
   - Chokidar monitors `REPO_PATH` for file changes
   - Ignores hidden files, node_modules, dist, build, target, .git
   - Triggers on add, change, and unlink events

2. **Content Hashing** (`src/index.ts:266-268`)
   - MD5 hash of file content for deduplication
   - Stored in SQLite cache to avoid reprocessing unchanged files

3. **Code Parsing** (`src/index.ts:411-463`)
   - Tree-sitter extracts meaningful code structures
   - Language-specific queries for functions, classes, methods, interfaces
   - Fallback to line-based chunking for unsupported formats

4. **Embedding Generation** (`src/index.ts:350-351`)
   - Ollama generates embeddings for each code chunk
   - Context includes file path, line numbers, and content

5. **Vector Storage** (`src/index.ts:372-376`)
   - Chunks stored as vectors in Qdrant
   - Metadata includes content, file path, line ranges, and context

### 3. Language Support (`src/index.ts:88-136`)

Tree-sitter supports structured parsing for multiple languages:

| Language | Extension | Extracted Elements |
|----------|-----------|-------------------|
| TypeScript | .ts | Functions, Methods, Classes, Interfaces |
| TSX | .tsx | Functions, Methods, Classes, Interfaces |
| JavaScript | .js | Functions, Methods, Classes |
| JSX | .jsx | Functions, Methods, Classes |
| Python | .py | Functions, Classes |
| Java | .java | Classes, Methods, Interfaces |
| Rust | .rs | Functions, Structs, Traits, Impls |
| Go | .go | Functions, Methods, Types |
| Kotlin | .kt | Classes, Functions |
| Dart | .dart | Classes, Functions |

For unsupported files, falls back to line-based chunking with overlap.

### 4. Database Schema

#### SQLite Cache (`src/index.ts:166-181`)

Tracks indexed files to prevent redundant processing:

```sql
CREATE TABLE indexed_files (
  collection_name TEXT NOT NULL,  -- Qdrant collection
  repo_path TEXT NOT NULL,        -- Repository root path
  file_path TEXT NOT NULL,        -- Relative file path
  content_hash TEXT NOT NULL,     -- MD5 of file content
  last_updated INTEGER,           -- Unix timestamp
  PRIMARY KEY (collection_name, repo_path, file_path)
);
```

#### Qdrant Collection (`src/index.ts:227-236`)

Stores vectors with the following structure:
- **Vector**: Embedding from Ollama (default 768 dimensions)
- **Payload**:
  - `content`: Code snippet text
  - `filePath`: Relative file path
  - `startLine`/`endLine`: Line range in source file
  - `fullContext`: Formatted context string

### 5. MCP Server Interface (`src/index.ts:577-680`)

Exposes two tools via the Model Context Protocol:

#### `semantic_search`
- **Input**: Natural language query, optional result limit
- **Process**: Query embedding → Vector similarity search → Result formatting
- **Output**: Formatted results with file paths, line numbers, scores, and content

#### `refresh_index`
- **Input**: None
- **Process**: Recursive file scan → Hash checking → Selective reprocessing
- **Output**: Success/error message

## Data Flow

### Indexing Flow
```
File Change → Content Hash → Cache Check → Parse Code → Generate Embeddings → Store Vectors → Update Cache
```

### Search Flow
```
Query → Embedding → Vector Search → Format Results → Return
```

## Error Handling and Resilience

### Graceful Degradation
- Missing Tree-sitter grammars → Line-based chunking fallback
- Ollama service down → Error logged, server continues
- Qdrant connection issues → Error logged, retry on next operation
- File system errors → Logged, file skipped

### Idempotency
- Content hashing ensures no duplicate processing
- SQLite cache provides file-level state tracking
- Vector operations use upsert with unique IDs

### Performance Optimizations
- File size filtering (default 1MB limit)
- Chunk size limits and overlap management
- Selective reprocessing based on content hashes
- Minimum chunk size filtering (default 50 chars)

## Configuration and Environment

All behavior controlled via environment variables (see CLAUDE.md for complete list). Key architectural parameters:

- **Repository Monitoring**: `REPO_PATH`, ignored patterns
- **Chunking Strategy**: `CHUNK_LINES`, `CHUNK_OVERLAP`, `MIN_CHUNK_SIZE`
- **Vector Configuration**: `VECTOR_SIZE`, `QDRANT_COLLECTION`
- **External Services**: `QDRANT_URL`, `OLLAMA_MODEL`
- **Performance**: `MAX_FILE_SIZE`, `SEARCH_LIMIT`

## Testing Architecture

Comprehensive test suite (`src/index.test.ts`) with:
- Unit tests for core logic
- Mocked external dependencies (Qdrant, Ollama, file system, SQLite)
- Integration scenarios for file processing and search
- Coverage reporting via Vitest

## Security Considerations

- No file system access outside configured `REPO_PATH`
- Content validation and size limits
- No arbitrary code execution
- External service communication via HTTPS
- No persistent storage of sensitive data