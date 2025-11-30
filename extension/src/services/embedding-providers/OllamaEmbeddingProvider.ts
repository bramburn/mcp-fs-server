import * as vscode from "vscode";
import { IEmbeddingProvider } from "./IEmbeddingProvider.js";
import { ILogger } from "../LoggerService.js";

/**
 * Ollama embedding provider implementation
 */
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly logger: ILogger,
    private readonly retryWithBackoff: <T>(
      fn: () => Promise<T>,
      maxRetries?: number,
      delayMs?: number
    ) => Promise<T>
  ) {}

  async generateEmbedding(
    text: string,
    token?: vscode.CancellationToken
  ): Promise<number[] | null> {
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    const startTime = Date.now();
    const textPreview =
      text.length > 100 ? text.substring(0, 100) + "..." : text;

    this.logger.log(
      `[EMBEDDING] Generating embedding with Ollama model '${this.model}' from ${this.baseUrl}, text length: ${text.length}`
    );
    this.logger.log(`[EMBEDDING] Text preview: "${textPreview}"`);

    try {
      const response = await this.retryWithBackoff(
        async () => {
          const controller = new AbortController();

          if (token) {
            token.onCancellationRequested(() => {
              this.logger.log(
                `[EMBEDDING] Ollama embedding generation cancelled via token`
              );
              controller.abort();
            });
          }

          const fetchStartTime = Date.now();
          const fetchResponse = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: this.model,
              prompt: text,
            }),
            signal: controller.signal,
          });
          const fetchDuration = Date.now() - fetchStartTime;
          this.logger.log(
            `[EMBEDDING] Ollama fetch completed in ${fetchDuration}ms, status: ${fetchResponse.status}`
          );

          if (!fetchResponse.ok) {
            const errorText = await fetchResponse
              .text()
              .catch(() => "Unable to read error response");
            this.logger.log(
              `[EMBEDDING] Ollama embedding failed - Status: ${fetchResponse.status}, Response: ${errorText}`,
              "ERROR"
            );
            throw new Error(
              `Ollama Error: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`
            );
          }

          return fetchResponse;
        },
        2,
        500
      );

      const data = (await response.json()) as { embedding: number[] };
      const totalDuration = Date.now() - startTime;

      this.logger.log(
        `[EMBEDDING] Ollama embedding generated successfully - total: ${totalDuration}ms, dimensions: ${data.embedding.length}`
      );
      return data.embedding;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[EMBEDDING] Ollama embedding generation was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this.logger.log(
        `[EMBEDDING] Ollama embedding generation failed after ${duration}ms: ${error.message}`,
        "ERROR"
      );

      return null;
    }
  }

  async getEmbeddingDimension(
    token?: vscode.CancellationToken
  ): Promise<number> {
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    try {
      const testText = "dimension detection test";
      const testEmbedding = await this.generateEmbedding(testText, token);

      if (testEmbedding && testEmbedding.length > 0) {
        const dimension = testEmbedding.length;
        this.logger.log(
          `[EMBEDDING] Detected Ollama embedding dimension: ${dimension}`
        );
        return dimension;
      } else {
        this.logger.log(
          "[EMBEDDING] Failed to generate test embedding, using fallback dimension 768",
          "WARN"
        );
        return 768;
      }
    } catch (error) {
      this.logger.log(
        `[EMBEDDING] Error detecting dimension: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "ERROR"
      );
      return 768;
    }
  }
}

