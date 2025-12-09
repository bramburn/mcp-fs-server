import { QdrantClient } from "@qdrant/js-client-rest";
import * as vscode from "vscode";
import { IVectorStore } from "./IVectorStore.js";
import { SearchResultItem } from "../types.js";
import { ILogger } from "../LoggerService.js";

/**
 * Qdrant vector store implementation
 */
export class QdrantVectorStore implements IVectorStore {
  constructor(
    private readonly client: QdrantClient,
    private readonly logger: ILogger
  ) {}

  async ensureCollection(
    name: string,
    vectorSize: number,
    token?: vscode.CancellationToken
  ): Promise<void> {
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    const startTime = Date.now();
    this.logger.log(
      `[VECTOR_STORE] Checking if Qdrant collection '${name}' exists`
    );

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(
            `[VECTOR_STORE] ensureCollection cancelled via token`
          );
          controller.abort();
        });
      }

      const collections = await this.client.getCollections();
      const getCollectionsDuration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] getCollections completed in ${getCollectionsDuration}ms, found ${collections.collections.length} collections`
      );

      if (token?.isCancellationRequested) {
        throw new Error("Indexing cancelled");
      }

      const exists = collections.collections.some((c) => c.name === name);
      this.logger.log(
        `[VECTOR_STORE] Qdrant collection '${name}' exists: ${exists}`
      );

      if (!exists) {
        if (token?.isCancellationRequested) {
          throw new Error("Indexing cancelled");
        }

        const createStartTime = Date.now();
        this.logger.log(
          `[VECTOR_STORE] Creating Qdrant collection '${name}' with vector size ${vectorSize}`
        );
        await this.client.createCollection(name, {
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
        });
        const createDuration = Date.now() - createStartTime;
        this.logger.log(
          `[VECTOR_STORE] Qdrant collection '${name}' created successfully in ${createDuration}ms`
        );
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[VECTOR_STORE] ensureCollection was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this.logger.log(
        `[VECTOR_STORE] Error checking/creating Qdrant collection '${name}' after ${duration}ms:`,
        "ERROR"
      );

      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this.logger.log(
          `[VECTOR_STORE] NETWORK ERROR in ensureCollection - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
      }

      throw e;
    }
  }

  async upsertPoints(
    collectionName: string,
    points: Array<{
      id: string;
      vector: number[];
      payload: {
        filePath: string;
        content: string;
        lineStart: number;
        lineEnd: number;
        type?: 'file' | 'guidance';
        guidanceId?: string;
        repoId?: string;
        commit?: string;
      };
    }>,
    token?: vscode.CancellationToken
  ): Promise<void> {
    if (token?.isCancellationRequested) {
      throw new Error("Indexing cancelled");
    }

    if (points.length === 0) return;

    const startTime = Date.now();
    this.logger.log(
      `[VECTOR_STORE] Upserting ${points.length} points to Qdrant collection '${collectionName}'`
    );

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(`[VECTOR_STORE] upsertPoints cancelled via token`);
          controller.abort();
        });
      }

      await this.client.upsert(collectionName, {
        points: points,
      });
      const duration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] Qdrant upsert completed successfully in ${duration}ms for ${points.length} points`
      );
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[VECTOR_STORE] upsertPoints was aborted after ${duration}ms`
        );
        throw new Error("Indexing cancelled");
      }

      this.logger.log(
        `[VECTOR_STORE] Qdrant upsert failed after ${duration}ms for ${points.length} points:`,
        "ERROR"
      );

      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this.logger.log(
          `[VECTOR_STORE] NETWORK ERROR in upsertPoints - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
      }

      throw e;
    }
  }

  async search(
    collectionName: string,
    vector: number[],
    limit: number,
    token?: vscode.CancellationToken,
    filter?: any
  ): Promise<SearchResultItem[]> {
    if (token?.isCancellationRequested) {
      throw new Error("Search cancelled");
    }

    const startTime = Date.now();
    this.logger.log(
      `[VECTOR_STORE] Executing Qdrant vector search in collection '${collectionName}' with limit ${limit}`
    );

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(`[VECTOR_STORE] search cancelled via token`);
          controller.abort();
        });
      }

      const searchResult = await this.client.search(collectionName, {
        vector: vector,
        limit: limit,
        filter: filter, // Pass filter
        with_payload: true,
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] Qdrant search completed in ${duration}ms, found ${searchResult.length} results`
      );

      // Cast to expected structure
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: SearchResultItem[] = searchResult.map((hit: any) => ({
        id: hit.id,
        score: hit.score,
        payload: hit.payload,
      }));

      return results;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));

      if (error.name === "AbortError") {
        this.logger.log(
          `[VECTOR_STORE] search was aborted after ${duration}ms`
        );
        throw new Error("Search cancelled");
      }

      this.logger.log(
        `[VECTOR_STORE] Qdrant search failed after ${duration}ms:`,
        "ERROR"
      );

      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("connection reset") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        this.logger.log(
          `[VECTOR_STORE] NETWORK ERROR in search - Type: ${error.name}, Message: ${error.message}`,
          "FATAL"
        );
      }

      throw e;
    }
  }
}
