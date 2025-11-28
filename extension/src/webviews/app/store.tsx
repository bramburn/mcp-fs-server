import { create } from "zustand";
import type {
  FileSnippetResult,
  IndexStatusParams,
  QdrantOllamaConfig,
} from "../protocol";

export type ViewType = "search" | "settings" | "test";
export type IndexStatus = IndexStatusParams["status"] | "ready";

interface AppState {
  // View management
  view: ViewType;
  setView: (view: ViewType) => void;

  // Search state
  query: string;
  setQuery: (query: string) => void;
  searchResults: FileSnippetResult[];
  setSearchResults: (results: FileSnippetResult[]) => void;
  isSearching: boolean;
  setIsSearching: (searching: boolean) => void;

  // Index state
  indexStatus: IndexStatus;
  setIndexStatus: (status: IndexStatus) => void;
  indexProgress: number;
  setIndexProgress: (progress: number) => void;
  indexStats: { vectorCount: number } | undefined;
  setIndexStats: (stats: { vectorCount: number } | undefined) => void;

  // Configuration
  config: QdrantOllamaConfig | undefined;
  setConfig: (config: QdrantOllamaConfig | undefined) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  view: "search",
  query: "",
  searchResults: [],
  isSearching: false,
  indexStatus: "ready",
  indexProgress: 0,
  indexStats: undefined,
  config: undefined,

  // Actions
  setView: (view) => set({ view }),
  setQuery: (query) => set({ query }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIndexStatus: (indexStatus) => set({ indexStatus }),
  setIndexProgress: (indexProgress) => set({ indexProgress }),
  setIndexStats: (indexStats) => set({ indexStats }),
  setConfig: (config) => set({ config }),
}));
