import * as vscode from "vscode";
import { QdrantOllamaConfig } from "../webviews/protocol.js";

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
  };
  qdrantConfig?: QdrantOllamaConfig;
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
      // Added backend/other languages commonly supported by Tree-sitter
      "python", 
      "java",
      "rust",
      "go",
      "kotlin",
    ],
  },
  search: {
    limit: 10,
    threshold: 0.7,
    includeQueryInCopy: false,
  },
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
      },
      qdrantConfig: undefined, // Will be loaded separately from file (legacy/migration)
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