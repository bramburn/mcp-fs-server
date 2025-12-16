import * as vscode from "vscode";
import { truncateByBytes } from "../../utils/stringUtils.js";
import { ILogger } from "../LoggerService.js";
import { SearchResultItem } from "../types.js";
import { IVectorStore } from "./IVectorStore.js";

/**
 * Pinecone vector store implementation using new SDK
 */
export class PineconeVectorStore implements IVectorStore {
  private readonly indexName: string;
  private readonly apiKey: string;
  private readonly host: string;
  private readonly logger: ILogger;

  constructor(
    indexName: string,
    apiKey: string,
    logger: ILogger,
    host?: string
  ) {
    this.indexName = indexName;
    this.apiKey = apiKey;
    this.logger = logger;
    this.host = host || `${indexName}.pinecone.io`;
  }

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
      `[VECTOR_STORE] Checking if Pinecone index '${name}' exists`
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

      const baseUrl = this.host.startsWith("http")
        ? this.host
        : `https://${this.host}`;
      const describeResponse = await fetch(`${baseUrl}/describe_index_stats`, {
        method: "GET",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!describeResponse.ok) {
        const errorText = await describeResponse
          .text()
          .catch(() => "Unable to read error response");
        this.logger.log(
          `[VECTOR_STORE] Pinecone index check failed - Status: ${describeResponse.status}, Response: ${errorText}`,
          "ERROR"
        );
        throw new Error(
          `Pinecone Error: ${describeResponse.status} ${describeResponse.statusText} - ${errorText}`
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] Pinecone index '${name}' verified successfully in ${duration}ms`
      );
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
        `[VECTOR_STORE] Error verifying Pinecone index '${name}' after ${duration}ms:`,
        "ERROR"
      );

      throw e;
    }
  }

  async upsertPoints(
    collectionName: string,
    // Fix: Explicitly define the type here to include the new fields
    points: Array<{
      id: string;
      vector: number[];
      payload: {
        filePath: string;
        content: string;
        lineStart: number;
        lineEnd: number;
        type?: "file" | "guidance";
        guidanceId?: string;
        repoId?: string;
        commit?: string;
        indexName?: string;
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
      `[VECTOR_STORE] Upserting ${points.length} points to Pinecone index '${collectionName}'`
    );

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(`[VECTOR_STORE] upsertPoints cancelled via token`);
          controller.abort();
        });
      }

      // Transform points to Pinecone format
      const pineconeVectors = points.map((point) => {
        // Truncate content to avoid exceeding Pinecone's 40KB metadata limit
        // We leave some buffer (35KB for content) for other fields
        const safeContent = truncateByBytes(point.payload.content, 35000);

        return {
          id: point.id,
          values: point.vector,
          metadata: {
            filePath: point.payload.filePath,
            content: safeContent,
            lineStart: point.payload.lineStart,
            lineEnd: point.payload.lineEnd,
            type: point.payload.type,
            guidanceId: point.payload.guidanceId,
            // Map new fields safely
            repoId: point.payload.repoId,
            commit: point.payload.commit,
            indexName: point.payload.indexName,
          },
        };
      });

      const baseUrl = this.host.startsWith("http")
        ? this.host
        : `https://${this.host}`;
      const upsertResponse = await fetch(`${baseUrl}/vectors/upsert`, {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vectors: pineconeVectors,
          namespace: collectionName,
        }),
        signal: controller.signal,
      });

      if (!upsertResponse.ok) {
        const errorText = await upsertResponse
          .text()
          .catch(() => "Unable to read error response");
        this.logger.log(
          `[VECTOR_STORE] Pinecone upsert failed - Status: ${upsertResponse.status}, Response: ${errorText}`,
          "ERROR"
        );
        throw new Error(
          `Pinecone Error: ${upsertResponse.status} ${upsertResponse.statusText} - ${errorText}`
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] Pinecone upsert completed successfully in ${duration}ms for ${points.length} points`
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
        `[VECTOR_STORE] Pinecone upsert failed after ${duration}ms for ${points.length} points:`,
        "ERROR"
      );

      throw e;
    }
  }

  async search(
    collectionName: string,
    vector: number[],
    limit: number,
    token?: vscode.CancellationToken,
    filter?: Record<string, unknown> // Fix: Use Record<string, unknown> instead of 'any'
  ): Promise<SearchResultItem[]> {
    if (token?.isCancellationRequested) {
      throw new Error("Search cancelled");
    }

    const startTime = Date.now();
    this.logger.log(
      `[VECTOR_STORE] Executing Pinecone vector search in index '${collectionName}' with limit ${limit}`
    );

    try {
      const controller = new AbortController();

      if (token) {
        token.onCancellationRequested(() => {
          this.logger.log(`[VECTOR_STORE] search cancelled via token`);
          controller.abort();
        });
      }

      const baseUrl = this.host.startsWith("http")
        ? this.host
        : `https://${this.host}`;

      // Fix: Define the body type explicitly to avoid 'any'
      interface SearchBody {
        vector: number[];
        topK: number;
        includeMetadata: boolean;
        namespace: string;
        filter?: Record<string, unknown>;
      }

      const body: SearchBody = {
        vector: vector,
        topK: limit,
        includeMetadata: true,
        namespace: collectionName,
      };

      if (filter) {
        body.filter = this.translateFilter(filter);
      }

      const searchResponse = await fetch(`${baseUrl}/query`, {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse
          .text()
          .catch(() => "Unable to read error response");
        this.logger.log(
          `[VECTOR_STORE] Pinecone search failed - Status: ${searchResponse.status}, Response: ${errorText}`,
          "ERROR"
        );
        throw new Error(
          `Pinecone Error: ${searchResponse.status} ${searchResponse.statusText} - ${errorText}`
        );
      }

      const data = (await searchResponse.json()) as {
        matches: Array<{
          id: string;
          score: number;
          metadata: {
            filePath: string;
            content: string;
            lineStart: number;
            lineEnd: number;
            type?: "file" | "guidance";
            guidanceId?: string;
          };
        }>;
      };

      const duration = Date.now() - startTime;
      this.logger.log(
        `[VECTOR_STORE] Pinecone search completed in ${duration}ms, found ${data.matches.length} results`
      );

      // Transform Pinecone results to SearchResultItem format
      const results: SearchResultItem[] = data.matches.map((match) => ({
        id: match.id,
        score: match.score,
        payload: match.metadata,
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
        `[VECTOR_STORE] Pinecone search failed after ${duration}ms:`,
        "ERROR"
      );

      throw e;
    }
  }

  /**
   * Translates Qdrant-style filters to Pinecone syntax
   */
  private translateFilter(filter: Record<string, any>): Record<string, any> {
    // Pinecone filter accumulator
    const pineconeFilter: Record<string, any> = {};

    // 1. Handle "must_not" (Qdrant) -> "$ne" (Pinecone)
    // Expecting: { must_not: [ { key: "type", match: { value: "guidance" } } ] }
    if (filter.must_not && Array.isArray(filter.must_not)) {
      for (const condition of filter.must_not) {
        if (
          condition.key &&
          condition.match &&
          condition.match.value !== undefined
        ) {
          // Pinecone: { "type": { "$ne": "guidance" } }
          pineconeFilter[condition.key] = { $ne: condition.match.value };
        }
      }
    }

    // 2. Handle "must" (Qdrant) -> Direct match (Pinecone)
    // Expecting: { must: [ { key: "type", match: { value: "guidance" } } ] }
    if (filter.must && Array.isArray(filter.must)) {
      for (const condition of filter.must) {
        if (
          condition.key &&
          condition.match &&
          condition.match.value !== undefined
        ) {
          // Pinecone: { "type": "guidance" } (implicit equality)
          // or { "type": { "$eq": "guidance" } }
          pineconeFilter[condition.key] = { $eq: condition.match.value };
        }
      }
    }

    // If no translation logic matched, return original (fallback)
    if (Object.keys(pineconeFilter).length === 0) {
      return filter;
    }

    return pineconeFilter;
  }

  /**
   * Delete vectors for a specific file from the collection
   */
  async deleteByFilePath(
    collectionName: string,
    repoId: string,
    filePath: string,
    token?: vscode.CancellationToken
  ): Promise<void> {
    try {
      const baseUrl = this.host.startsWith("http")
        ? this.host
        : `https://${this.host}`;

      // Create a filter to find vectors for the specific file
      const filter = {
        filePath: { $eq: filePath },
        repoId: { $eq: repoId }
      };

      // Delete vectors that match the filter
      const deleteResponse = await fetch(`${baseUrl}/vectors/delete`, {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: filter
        }),
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse
          .text();
        throw new Error(`Failed to delete vectors: ${deleteResponse.status} ${errorText}`);
      }

      this.logger.log(
        `[VECTOR_STORE] Deleted vectors for file: ${filePath} in index ${collectionName}`,
        "INFO"
      );
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logger.log(
        `[VECTOR_STORE] Error deleting vectors for ${filePath}: ${error.message}`,
        "ERROR"
      );
      throw error;
    }
  }
}
