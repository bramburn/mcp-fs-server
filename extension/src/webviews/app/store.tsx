// Update to your store.tsx file
// Replace the view type in your store definition with this updated version

import { create } from "zustand";

// Update this type union to include "debugger"
export type AppView = "search" | "debugger" | "settings" | "test";

export interface AppState {
  view: AppView;
  setView: (view: AppView) => void;
  searchResults: any[];
  setSearchResults: (results: any[]) => void;
  indexStatus: string;
  setIndexStatus: (status: string) => void;
  indexProgress: number;
  setIndexProgress: (progress: number) => void;
  indexStats: any;
  setIndexStats: (stats: any) => void;
  config: any;
  setConfig: (config: any) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "search", // Default to search view
  setView: (view: AppView) => set({ view }),
  
  searchResults: [],
  setSearchResults: (results: any[]) => set({ searchResults: results }),
  
  indexStatus: "ready",
  setIndexStatus: (status: string) => set({ indexStatus: status }),
  
  indexProgress: 0,
  setIndexProgress: (progress: number) => set({ indexProgress: progress }),
  
  indexStats: null,
  setIndexStats: (stats: any) => set({ indexStats: stats }),
  
  config: null,
  setConfig: (config: any) => set({ config }),
}));