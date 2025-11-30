import * as vscode from "vscode";
import { IEmbeddingProvider } from "./IEmbeddingProvider.js";
import { ILogger } from "../LoggerService.js";

/**
 * OpenAI embedding provider implementation
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private readonly embeddingDimensions: Record<string, number> = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
  };

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly logger: ILogger
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
      `[EMBEDDING] Generating embedding with OpenAI model '${this.model}', text length: ${text.length}`
    );
    this.logger.log(`[EMBEDDING] Text preview: "${textPreview}"`);

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(
            `[EMBEDDING] OpenAI embedding generation cancelled via token`
          );
          controller.abort();
        });
      }

      const fetchStartTime = Date.now();
      const fetchResponse = await fetch(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: text,
          }),
          signal: controller.signal,
        }
      );
      const fetchDuration = Date.now() - fetchStartTime;
      this.logger.log(
        `[EMBEDDING] OpenAI fetch completed in ${fetchDuration}ms, status: ${fetchResponse.status}`
      );

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse
          .text()
          .catch(() => "Unable to read error response");
        this.logger.log(
          `[EMBEDDING] OpenAI embedding failed - Status: ${fetchResponse.status}, Response: ${errorText}`,
          "ERROR"
        );
        throw new Error(
          `OpenAI Error: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`
        );
      }

      const data = (await fetchResponse.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      const totalDuration = Date.now() - startTime;

      this.logger.log(
        `[EMBEDDING] OpenAI embedding generated successfully - total: ${totalDuration}ms, dimensions: ${data.data[0].embedding.length}`
      );
      return data.data[0].embedding;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[EMBEDDING] OpenAI embedding generation was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this.logger.log(
        `[EMBEDDING] OpenAI embedding generation failed after ${duration}ms: ${error.message}`,
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

    // Return known dimension for the model
    const dimension = this.embeddingDimensions[this.model] || 1536;
    this.logger.log(
      `[EMBEDDING] OpenAI model '${this.model}' dimension: ${dimension}`
    );
    return dimension;
  }
}

