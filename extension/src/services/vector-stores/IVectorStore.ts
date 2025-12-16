import * as vscode from "vscode";
import { SearchResultItem } from "../types.js";

/**
 * Interface for vector store providers (Qdrant, Pinecone)
 */
export interface IVectorStore {
  /**
   * Ensure a collection/index exists with the specified configuration
   * @param name Collection/index name
   * @param vectorSize Dimension of vectors
   * @param token Optional cancellation token
   */
  ensureCollection(
    name: string,
    vectorSize: number,
    token?: vscode.CancellationToken
  ): Promise<void>;

  /**
   * Upsert points/vectors into the collection
   * @param collectionName Collection/index name
   * @param points Array of points to upsert
   * @param token Optional cancellation token
   */
  upsertPoints(
    collectionName: string,
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
        // New fields
        repoId?: string;
        commit?: string;
        indexName?: string;
      };
    }>,
    token?: vscode.CancellationToken
  ): Promise<void>;

  /**
   * Search for similar vectors
   * @param collectionName Collection/index name
   * @param vector Query vector
   * @param limit Maximum number of results
   * @param token Optional cancellation token
   * @param filter Optional filter object (provider specific)
   * @returns Array of search results
   */
  search(
    collectionName: string,
    vector: number[],
    limit: number,
    token?: vscode.CancellationToken,
    filter?: any
  ): Promise<SearchResultItem[]>;

  /**
   * Delete vectors for a specific file from the collection
   * @param collectionName Collection/index name
   * @param repoId Repository ID
   * @param filePath Relative file path
   * @param token Optional cancellation token
   */
  deleteByFilePath(
    collectionName: string,
    repoId: string,
    filePath: string,
    token?: vscode.CancellationToken
  ): Promise<void>;
}
