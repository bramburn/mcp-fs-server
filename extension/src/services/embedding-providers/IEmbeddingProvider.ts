import * as vscode from "vscode";

/**
 * Interface for embedding providers (Ollama, OpenAI, Gemini)
 */
export interface IEmbeddingProvider {
  /**
   * Generate embeddings for the given text
   * @param text Text to embed
   * @param token Optional cancellation token
   * @returns Embedding vector or null on failure
   */
  generateEmbedding(
    text: string,
    token?: vscode.CancellationToken
  ): Promise<number[] | null>;

  /**
   * Get the embedding dimension for this provider's model
   * @param token Optional cancellation token
   * @returns The embedding dimension
   */
  getEmbeddingDimension(token?: vscode.CancellationToken): Promise<number>;
}

