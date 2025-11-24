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
import crypto from "node:crypto";
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
