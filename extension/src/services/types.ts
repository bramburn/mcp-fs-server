/**
 * Types and interfaces for the indexing service
 */

/**
 * Search result item from vector store
 */
export interface SearchResultItem {
  id: string | number;
  score: number;
  payload: {
    filePath: string;
    content: string;
    lineStart: number;
    lineEnd: number;
  };
}

/**
 * Indexing progress information
 */
export interface IndexingProgress {
  current: number;
  total: number;
  currentFile?: string;
  status: "starting" | "indexing" | "completed" | "error" | "cancelled";
}

/**
 * Callback type for indexing progress updates
 */
export type IndexingProgressListener = (progress: IndexingProgress) => void;

