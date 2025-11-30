import * as vscode from "vscode";
import { IEmbeddingProvider } from "./IEmbeddingProvider.js";
import { ILogger } from "../LoggerService.js";

/**
 * Gemini embedding provider implementation
 */
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
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
      `[EMBEDDING] Generating embedding with Gemini model '${this.model}', text length: ${text.length}`
    );
    this.logger.log(`[EMBEDDING] Text preview: "${textPreview}"`);

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(
            `[EMBEDDING] Gemini embedding generation cancelled via token`
          );
          controller.abort();
        });
      }

      const fetchStartTime = Date.now();
      const fetchResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: {
              parts: [{ text }],
            },
          }),
          signal: controller.signal,
        }
      );
      const fetchDuration = Date.now() - fetchStartTime;
      this.logger.log(
        `[EMBEDDING] Gemini fetch completed in ${fetchDuration}ms, status: ${fetchResponse.status}`
      );

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse
          .text()
          .catch(() => "Unable to read error response");
        this.logger.log(
          `[EMBEDDING] Gemini embedding failed - Status: ${fetchResponse.status}, Response: ${errorText}`,
          "ERROR"
        );
        throw new Error(
          `Gemini Error: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`
        );
      }

      const data = (await fetchResponse.json()) as {
        embedding: { values: number[] };
      };
      const totalDuration = Date.now() - startTime;

      this.logger.log(
        `[EMBEDDING] Gemini embedding generated successfully - total: ${totalDuration}ms, dimensions: ${data.embedding.values.length}`
      );
      return data.embedding.values;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[EMBEDDING] Gemini embedding generation was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this.logger.log(
        `[EMBEDDING] Gemini embedding generation failed after ${duration}ms: ${error.message}`,
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

    // Gemini text-embedding-004 uses 768 dimensions
    const dimension = 768;
    this.logger.log(
      `[EMBEDDING] Gemini model '${this.model}' dimension: ${dimension}`
    );
    return dimension;
  }
}

