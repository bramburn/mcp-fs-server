import * as vscode from "vscode";
import { QdrantOllamaConfig } from "./webviews/protocol.js";

/**
 * Configuration paths for VS Code settings
 * Updated to use the new 'semanticSearch' namespace
 */
export const ConfigPath = {
  GENERAL: "semanticSearch", // Root section
  // Note: We are now using flat keys within the 'semanticSearch' section
  // These constants are kept for compatibility with ConfigService's change detection
  // but specific key retrieval is handled in the Factory below using camelCase.
  INDEXING: "semanticSearch", 
  SEARCH: "semanticSearch",
} as const;

/**
 * Strongly typed configuration model
 */
export interface Configuration {
  general: {
    trace: boolean;
  };
  indexing: {
    enabled: boolean;
    maxFiles: number;
    excludePatterns: string[];
    includeExtensions: string[];
  };
  search: {
    limit: number;
    threshold: number;
    includeQueryInCopy?: boolean;
    guidanceLimit: number;
    guidanceThreshold: number;
  };
  clipboard: {
      monitorDuration: number;
  };
  qdrantConfig?: QdrantOllamaConfig;
  semanticSearch?: {
    pineconeHost?: string;
  };
}

/**
 * Default configuration values
 */
export const DefaultConfiguration: Configuration = {
  general: {
    trace: false,
  },
  indexing: {
    enabled: true,
    maxFiles: 500,
    excludePatterns: [
      "**/node_modules/**",
      "**/.git/**",
      "**/out/**",
      "**/dist/**",
      "**/build/**",
    ],
    includeExtensions: [
      "ts",
      "js",
      "tsx",
      "jsx",
      "json",
      "md",
      "txt",
      "html",
      "css",
      // Added backend/other languages supported by downloaded WASM modules
      "py", 
      "java",
      "rs",
      "go",
      "kt",
      "kts",
    ],
  },
  search: {
    limit: 10,
    threshold: 0.7,
    includeQueryInCopy: false,
    guidanceLimit: 2,
    guidanceThreshold: 0.6
  },
  clipboard: {
      monitorDuration: 5
  }
};

/**
 * Factory class to create Configuration from VS Code workspace configuration
 */
export class ConfigurationFactory {
  /**
   * Create a typed Configuration from VS Code workspace configuration
   */
  public static from(
    vscodeConfig: vscode.WorkspaceConfiguration
  ): Configuration {
    // vscodeConfig is already scoped to "semanticSearch" when calling getConfiguration("semanticSearch")
    // or scoped to root if getConfiguration() is called without args.
    // ConfigService.ts calls getConfiguration(ConfigPath.GENERAL) -> "semanticSearch"
    
    return {
      general: {
        trace: vscodeConfig.get("trace", DefaultConfiguration.general.trace),
      },
      indexing: {
        enabled: vscodeConfig.get(
          "indexingEnabled",
          DefaultConfiguration.indexing.enabled
        ),
        maxFiles: vscodeConfig.get(
          "indexingMaxFiles",
          DefaultConfiguration.indexing.maxFiles
        ),
        excludePatterns: vscodeConfig.get(
          "indexingExcludePatterns",
          DefaultConfiguration.indexing.excludePatterns
        ),
        includeExtensions: vscodeConfig.get(
          "indexingIncludeExtensions",
          DefaultConfiguration.indexing.includeExtensions
        ),
      },
      search: {
        limit: vscodeConfig.get(
          "searchLimit",
          DefaultConfiguration.search.limit
        ),
        threshold: vscodeConfig.get(
          "searchThreshold",
          DefaultConfiguration.search.threshold
        ),
        includeQueryInCopy: vscodeConfig.get(
          "includeQueryInCopy",
          DefaultConfiguration.search.includeQueryInCopy
        ),
        guidanceLimit: vscodeConfig.get(
          "guidanceSearchLimit",
          DefaultConfiguration.search.guidanceLimit
        ),
        guidanceThreshold: vscodeConfig.get(
          "guidanceSearchThreshold",
          DefaultConfiguration.search.guidanceThreshold
        )
      },
      clipboard: {
          monitorDuration: vscodeConfig.get(
            "clipboardMonitorDuration",
            DefaultConfiguration.clipboard.monitorDuration
          )
      },
      // BRIDGE: Map native VS Code settings to the internal legacy structure
      // This allows existing services to function without rewriting them to read individual setting keys.
      qdrantConfig: {
        active_vector_db: vscodeConfig.get("activeVectorDb", "qdrant") as 'qdrant' | 'pinecone',
        active_embedding_provider: vscodeConfig.get(
          "activeEmbeddingProvider",
          "ollama"
        ) as 'ollama' | 'openai' | 'gemini',
        index_info: {
          name: vscodeConfig.get("indexName", ""),
          embedding_dimension: vscodeConfig.get("embeddingDimension", 768),
        },
        qdrant_config: {
          // FIX: Updated to remote URL provided by user
          url: vscodeConfig.get("qdrantUrl", "https://qdrant.icelabz.co.uk"),
          api_key: vscodeConfig.get("qdrantApiKey", ""),
        },
        pinecone_config: {
          index_name: vscodeConfig.get("pineconeIndexName", ""),
          environment: "", // Deprecated, keeping empty for type safety
          api_key: vscodeConfig.get("pineconeApiKey", ""),
        },
        ollama_config: {
          base_url: vscodeConfig.get("ollamaBaseUrl", "http://localhost:11434"),
          model: vscodeConfig.get("ollamaModel", "nomic-embed-text"),
        },
        openai_config: {
          api_key: vscodeConfig.get("openaiApiKey", ""),
          model: vscodeConfig.get("openaiModel", "text-embedding-3-small"),
        },
        gemini_config: {
          api_key: vscodeConfig.get("geminiApiKey", ""),
          model: vscodeConfig.get("geminiModel", "text-embedding-004"),
        },
      },
      semanticSearch: {
        pineconeHost: vscodeConfig.get("pineconeHost", ""),
      },
    };
  }

  /**
   * Validate configuration structure
   */
  public static validate(config: Configuration): boolean {
    if (!config || typeof config !== "object") {
      return false;
    }

    // Validate general section
    if (!config.general || typeof config.general.trace !== "boolean") {
      return false;
    }

    // Validate indexing section
    if (
      !config.indexing ||
      typeof config.indexing.enabled !== "boolean" ||
      typeof config.indexing.maxFiles !== "number" ||
      !Array.isArray(config.indexing.excludePatterns) ||
      !Array.isArray(config.indexing.includeExtensions)
    ) {
      return false;
    }

    // Validate search section
    if (
      !config.search ||
      typeof config.search.limit !== "number" ||
      typeof config.search.threshold !== "number"
    ) {
      return false;
    }

    return true;
  }
}