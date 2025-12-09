import * as vscode from "vscode";
import { type VSCodeSettings, type IndexStateMap, type RepoIndexState } from "./webviews/protocol.js";

export class SettingsManager {
  private static readonly SECTION_ID = "semanticSearch";

  // Get all settings from VS Code configuration
  static getSettings(): VSCodeSettings {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);
    return {
      // Vector DB settings
      activeVectorDb: config.get<string>("activeVectorDb", "qdrant"),
      qdrantUrl: config.get<string>("qdrantUrl", "http://localhost:6333"),
      qdrantApiKey: config.get<string>("qdrantApiKey", ""),
      pineconeIndexName: config.get<string>("pineconeIndexName", ""),
      pineconeHost: config.get<string>("pineconeHost", ""),
      pineconeApiKey: config.get<string>("pineconeApiKey", ""),

      // Embedding provider settings
      activeEmbeddingProvider: config.get<string>(
        "activeEmbeddingProvider",
        "ollama"
      ),
      ollamaBaseUrl: config.get<string>(
        "ollamaBaseUrl",
        "http://localhost:11434"
      ),
      ollamaModel: config.get<string>("ollamaModel", "nomic-embed-text"),
      openaiApiKey: config.get<string>("openaiApiKey", ""),
      openaiModel: config.get<string>("openaiModel", "text-embedding-3-small"),
      geminiApiKey: config.get<string>("geminiApiKey", ""),
      geminiModel: config.get<string>("geminiModel", "text-embedding-004"),

      // Index settings
      indexName: config.get<string>("indexName", ""),
      embeddingDimension: config.get<number>("embeddingDimension", 768),

      // Search settings
      searchLimit: config.get<number>("searchLimit", 10),
      searchThreshold: config.get<number>("searchThreshold", 0.7),
      fileSearchLimit: config.get<number>("indexingMaxFiles", 1000),
      includeQueryInCopy: config.get<boolean>("includeQueryInCopy", false),
      guidanceSearchLimit: config.get<number>("guidanceSearchLimit", 2),
      guidanceSearchThreshold: config.get<number>("guidanceSearchThreshold", 0.6),

      // Clipboard Settings
      clipboardMonitorDuration: config.get<number>("clipboardMonitorDuration", 5)
    };
  }

  // --- New Methods for Repo State ---

  static getRepoIndexStates(): IndexStateMap {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);
    return config.get<IndexStateMap>("indexInfoByRepo", {});
  }

  static async updateRepoIndexState(repoId: string, state: RepoIndexState): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);
    const currentMap = config.get<IndexStateMap>("indexInfoByRepo", {});
    
    const updatedMap = {
        ...currentMap,
        [repoId]: state
    };

    await config.update("indexInfoByRepo", updatedMap, vscode.ConfigurationTarget.Global);
  }

  // Update settings in VS Code configuration
  static async updateSettings(
    settings: Partial<VSCodeSettings>
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);

    // Create a list of promises for all updates
    const updates: Promise<void>[] = [];

    // Vector DB settings
    if (settings.activeVectorDb !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("activeVectorDb", settings.activeVectorDb)
        )
      );
    }
    if (settings.qdrantUrl !== undefined) {
      updates.push(
        Promise.resolve(config.update("qdrantUrl", settings.qdrantUrl))
      );
    }
    if (settings.qdrantApiKey !== undefined) {
      updates.push(
        Promise.resolve(config.update("qdrantApiKey", settings.qdrantApiKey))
      );
    }
    if (settings.pineconeIndexName !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("pineconeIndexName", settings.pineconeIndexName)
        )
      );
    }
    if (settings.pineconeHost !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("pineconeHost", settings.pineconeHost)
        )
      );
    }
    if (settings.pineconeApiKey !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("pineconeApiKey", settings.pineconeApiKey)
        )
      );
    }

    // Embedding provider settings
    if (settings.activeEmbeddingProvider !== undefined) {
      updates.push(
        Promise.resolve(
          config.update(
            "activeEmbeddingProvider",
            settings.activeEmbeddingProvider
          )
        )
      );
    }
    if (settings.ollamaBaseUrl !== undefined) {
      updates.push(
        Promise.resolve(config.update("ollamaBaseUrl", settings.ollamaBaseUrl))
      );
    }
    if (settings.ollamaModel !== undefined) {
      updates.push(
        Promise.resolve(config.update("ollamaModel", settings.ollamaModel))
      );
    }
    if (settings.openaiApiKey !== undefined) {
      updates.push(
        Promise.resolve(config.update("openaiApiKey", settings.openaiApiKey))
      );
    }
    if (settings.openaiModel !== undefined) {
      updates.push(
        Promise.resolve(config.update("openaiModel", settings.openaiModel))
      );
    }
    if (settings.geminiApiKey !== undefined) {
      updates.push(
        Promise.resolve(config.update("geminiApiKey", settings.geminiApiKey))
      );
    }
    if (settings.geminiModel !== undefined) {
      updates.push(
        Promise.resolve(config.update("geminiModel", settings.geminiModel))
      );
    }

    // Index settings
    if (settings.indexName !== undefined) {
      updates.push(
        Promise.resolve(config.update("indexName", settings.indexName))
      );
    }
    if (settings.embeddingDimension !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("embeddingDimension", settings.embeddingDimension)
        )
      );
    }

    // Search settings
    if (settings.searchLimit !== undefined) {
      updates.push(
        Promise.resolve(config.update("searchLimit", settings.searchLimit))
      );
    }
    if (settings.searchThreshold !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("searchThreshold", settings.searchThreshold)
        )
      );
    }
    if (settings.fileSearchLimit !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("indexingMaxFiles", settings.fileSearchLimit)
        )
      );
    }
    if (settings.includeQueryInCopy !== undefined) {
      updates.push(
        Promise.resolve(
          config.update("includeQueryInCopy", settings.includeQueryInCopy)
        )
      );
    }
    if (settings.guidanceSearchLimit !== undefined) {
      updates.push(
        Promise.resolve(config.update("guidanceSearchLimit", settings.guidanceSearchLimit))
      );
    }
    if (settings.guidanceSearchThreshold !== undefined) {
      updates.push(
        Promise.resolve(config.update("guidanceSearchThreshold", settings.guidanceSearchThreshold))
      );
    }
    if (settings.clipboardMonitorDuration !== undefined) {
      updates.push(
        Promise.resolve(config.update("clipboardMonitorDuration", settings.clipboardMonitorDuration))
      );
    }

    // Wait for all updates to complete
    await Promise.all(updates);
  }
}