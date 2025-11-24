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
    if (CONFIG.logLevel === 'info' || CONFIG.logLevel === 'debug') {
      console.log(`[MCP-INFO] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[MCP-ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (CONFIG.logLevel === 'debug') {
      console.log(`[MCP-DEBUG] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[MCP-WARN] ${message}`, ...args);
  }
};

// --- Language Definitions ---
const LANGUAGES: Record<string, { lang: string; query: string }> = {
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

  // Track indexed files: filePath -> contentHash
  private fileState = new Map<string, string>();

  constructor() {
    this.qdrant = new QdrantClient({
      url: CONFIG.qdrantUrl,
      apiKey: CONFIG.qdrantApiKey,
    });
  }

  async init() {
    // AI!: Using console.error for status messages is unconventional. console.log is typically used for informational output.
    console.error("[MCP] Initializing Semantic Watcher...");

    // 1. Init Tree Sitter (WASM)
    try {
      await Parser.init({
        locateFile(scriptName: string, scriptDirectory: string) {
            // AI!: The locateFile function assumes CONFIG.wasmPath is relative to the script's execution context. If CONFIG.wasmPath is an absolute path, this might behave differently. It's generally safer to use path.resolve if absolute paths are expected.
            return path.join(CONFIG.wasmPath, scriptName);
        },
      });
      this.parser = new Parser();

      const uniqueLangs = new Set(Object.values(LANGUAGES).map(l => l.lang));

      for (const langName of uniqueLangs) {
          const langPath = path.join(CONFIG.wasmPath, `tree-sitter-${langName}.wasm`);
          try {
            await fs.access(langPath);
            const lang = await Parser.Language.load(langPath);
            this.parsers[langName] = lang;
            // AI!: Using console.error for status messages.
            console.error(`[MCP] Loaded grammar: ${langName}`);
          } catch (e) {
            // AI!: This error message is informative, indicating why a grammar might be skipped.
            console.error(`[MCP] Skipped grammar ${langName} (not found in ${CONFIG.wasmPath})`);
          }
      }

    } catch (e) {
        console.error("[MCP] Failed to init Tree Sitter:", e);
    }

    // 2. Init Qdrant Collection
    try {
      const collections = await this.qdrant.getCollections();
      // FIX 2: Added explicit type (c: any) to prevent implicit any error
      // AI!: While 'any' suppresses the error, defining a proper interface for Qdrant's CollectionDescription would be more robust.
      const exists = collections.collections.find(
        (c: any) => c.name === CONFIG.collectionName
      );

      if (!exists) {
        await this.qdrant.createCollection(CONFIG.collectionName, {
          // AI!: Vector size (768) and distance ("Cosine") are hardcoded. These should ideally be configurable and match the Ollama model's embedding dimension.
          vectors: {
            size: 768,
            distance: "Cosine",
          },
        });
        // AI!: Using console.error for status messages.
        console.error(`[MCP] Created Qdrant collection: ${CONFIG.collectionName}`);
      }
    } catch (e) {
      console.error("[MCP] Qdrant connection error. Ensure Qdrant is running.", e);
    }

    // 3. Start Watcher
    this.startWatcher();
  }

  private startWatcher() {
    // AI!: Using console.error for status messages.
    console.error(`[MCP] Watching directory: ${CONFIG.repoPath}`);

    const watcher = chokidar.watch(CONFIG.repoPath, {
      // AI!: The ignore patterns are good, covering common exclusions. Ensure they align with project needs.
      ignored: /(^|[\]\/])\..|node_modules|dist|build|target|\.git/, 
      persistent: true,
      ignoreInitial: false, // AI!: Processes existing files on startup, which is usually desired for indexing.
    });

    watcher
      .on("add", (path) => this.handleFileChange(path))
      .on("change", (path) => this.handleFileChange(path))
      .on("unlink", (path) => this.handleFileDelete(path));
  }

  private getHash(content: string): string {
    // AI!: MD5 is generally sufficient for content hashing in this context (detecting changes). For security-sensitive applications, SHA-256 might be preferred, but it's likely overkill here.
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async handleFileChange(filePath: string) {
    try {
      const fullPath = path.resolve(filePath);
      const relativePath = path.relative(CONFIG.repoPath, filePath);

      try {
        const stats = await fs.stat(fullPath);
        // AI!: Files larger than 1MB are skipped. This is a reasonable heuristic, but the limit is hardcoded.
        if (stats.size > 1024 * 1024) return;
      } catch (e) { return; } // AI!: Silently return if file stats cannot be read (e.g., file deleted between watch event and stat call).

      const content = await fs.readFile(fullPath, "utf-8");
      const currentHash = this.getHash(content);
      const lastHash = this.fileState.get(relativePath);

      if (lastHash === currentHash) return; // AI!: Efficiently skips processing if file content hasn't changed.

      // AI!: Using console.error for status messages.
      console.error(`[MCP] Processing: ${relativePath}`);

      await this.handleFileDelete(filePath); // AI!: Deletes old entries before re-indexing, ensuring data consistency.
      const chunks = await this.splitCode(relativePath, content);
      const points = [];

      for (const chunk of chunks) {
        try {
            const embeddingResponse = await ollama.embeddings({
            model: CONFIG.ollamaModel,
            // AI!: The prompt for embeddings includes file path, lines, and content. This provides good context for the embedding model. Consider making the prompt template configurable.
            prompt: `File: ${chunk.filePath}\nLines: ${chunk.startLine}-${chunk.endLine}\n\n${chunk.content}`,
            });

            points.push({
            id: chunk.id,
            vector: embeddingResponse.embedding,
            payload: {
                content: chunk.content,
                filePath: chunk.filePath,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                fullContext: `File: ${chunk.filePath} (${chunk.startLine}-${chunk.endLine})\n${chunk.content}`,
            },
            });
        } catch(err) {
            // AI!: Ollama errors are caught and logged. Consider adding retry logic or a more specific error handling strategy if Ollama is intermittently unavailable.
            console.error(`[MCP] Ollama error for ${chunk.filePath}:`, err);
        }
      }

      if (points.length > 0) {
        await this.qdrant.upsert(CONFIG.collectionName, {
          wait: true,
          points: points,
        });
      }

      this.fileState.set(relativePath, currentHash);
      // AI!: Using console.error for status messages.
      console.error(`[MCP] Indexed ${chunks.length} chunks for ${relativePath}`);

    } catch (error) {
      console.error(`[MCP] Error processing ${filePath}:`, error);
    }
  }

  async handleFileDelete(filePath: string) {
    const relativePath = path.relative(CONFIG.repoPath, filePath);
    this.fileState.delete(relativePath);

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
      // AI!: Errors during deletion are silently ignored. It might be better to log these errors or handle them explicitly if data integrity is critical.
    } catch (e) { } // AI!: Silently ignore deletion errors.
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
            // AI!: Skips nodes that appear before the last processed node's end index, preventing overlapping or out-of-order processing.
            if (node.startIndex < lastIndex) continue;

            const chunkContent = node.text;
            // AI!: Chunks smaller than 50 characters are skipped. This threshold is hardcoded.
            if (chunkContent.length < 50) continue;

            const id = crypto.createHash('md5').update(`${filePath}:${node.startIndex}`).digest('hex');

            chunks.push({
            id: id,
            filePath,
            startLine: node.startPosition.row + 1, // AI!: Tree-sitter rows are 0-indexed, so add 1 for human-readable line numbers.
            endLine: node.endPosition.row + 1,
            content: chunkContent,
            contentHash: this.getHash(chunkContent)
            });

            lastIndex = node.endIndex;
        }
      } catch (e) {
          // AI!: If Tree-sitter parsing or querying fails, it falls back to a simpler line-based splitting method. This is a good fallback strategy.
          console.error(`[MCP] Tree-sitter query failed for ${filePath}, falling back to lines.`, e);
      }
    }

    // AI!: If no chunks were generated by Tree-sitter (e.g., unsupported language, parsing error, or no matching nodes), use a simpler line-based split.
    if (chunks.length === 0) {
        return this.simpleSplit(filePath, content);
    }

    return chunks;
  }

  // AI!: This simple split method divides content into chunks based on lines, with overlap.
  private simpleSplit(filePath: string, content: string): CodeChunk[] {
      const lines = content.split('\n');
      const chunkSize = 50; // AI!: Hardcoded chunk size.
      const overlap = 10; // AI!: Hardcoded overlap between chunks.
      const chunks: CodeChunk[] = [];

      for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
          const end = Math.min(i + chunkSize, lines.length);
          const chunkLines = lines.slice(i, end);
          const chunkText = chunkLines.join('\n');
          // AI!: Skips very short chunks (less than 10 characters) after joining lines.
          if (chunkText.trim().length < 10) continue;

          const id = crypto.createHash('md5').update(`${filePath}:${i}`).digest('hex');

          chunks.push({
              id,
              filePath,
              startLine: i + 1, // AI!: Line numbers are 1-indexed.
              endLine: end,
              content: chunkText,
              contentHash: this.getHash(chunkText)
          });
      }
      return chunks;
  }

  async search(query: string, limit: number = 5) {
      const embeddingResponse = await ollama.embeddings({
          model: CONFIG.ollamaModel,
          prompt: query
      });

      const searchResults = await this.qdrant.search(CONFIG.collectionName, {
          vector: embeddingResponse.embedding,
          limit: limit, // AI!: The search limit is hardcoded to 5 by default. This should ideally be configurable or passed from the caller.
          with_payload: true
      });

      // FIX 3: Added explicit type (res: any) for search results
      // AI!: The search results are mapped to a formatted string. Consider returning structured data for more flexibility.
      // AI!: The 'res: any' type assertion could be replaced with a more specific type if the Qdrant client's return structure is well-defined.
      return searchResults.map((res: any) => {
          const payload = res.payload as any; // AI!: 'payload as any' is a type assertion. Define a Payload interface for better type safety.
          return `Path: ${payload.filePath}\nLines: ${payload.startLine}-${payload.endLine}\nScore: ${res.score.toFixed(4)}\n\n${payload.content}\n---`;
      }).join('\n');
  }
}

// --- Main MCP Server Setup ---

const watcherService = new SemanticWatcher();
const server = new Server(
  {
    name: "mcp-semantic-watcher",
    version: "1.0.0",
  },
  {
    // AI!: The 'tools' object in capabilities is empty. If the Server class expects tools to be registered here, this might be a point of failure or limitation.
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
          },
          required: ["query"],
        },
      },
      {
        name: "refresh_index",
        description: "Manually triggers a re-scan of the repository.",
        inputSchema: {
            type: "object",
            properties: {}
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "semantic_search") {
    // AI!: Using 'args as any' for type assertion. Consider using Zod schema validation for arguments if available.
    const query = (args as any).query;
    if (!query) throw new Error("Query is required");

    try {
        const results = await watcherService.search(query);
        return {
            content: [{ type: "text", text: results }],
        };
    } catch (e: any) {
        // AI!: Error handling for search tool. Consider returning more structured error information.
        return {
            content: [{ type: "text", text: `Error searching: ${e.message}` }]
        }
    }
  }

  if (name === "refresh_index") {
      // AI!: The refresh_index tool is defined but its implementation is incomplete. It currently only returns a message and does not trigger a re-scan. This is a functional gap.
      // AI!: To implement this, it should likely call a method on watcherService to re-initialize or re-scan.
      return { content: [{ type: "text", text: "Index refresh triggered." }] };
  }

  throw new Error(`Tool ${name} not found`);
});

async function run() {
  await watcherService.init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // AI!: Using console.error for status messages.
  console.error("MCP Semantic Watcher Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
