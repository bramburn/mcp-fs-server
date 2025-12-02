import { create } from "zustand";

export type AppView = "search" | "debugger" | "settings" | "test";

export interface ClipboardHistoryItem {
  id: string;
  content: string;
  timestamp: number;
  type: "text" | "code" | "xml-command";
}

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

  // New Clipboard History
  clipboardHistory: ClipboardHistoryItem[];
  addClipboardItem: (content: string) => void;
  clearClipboardHistory: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "search",
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

  clipboardHistory: [],
  addClipboardItem: (content: string) => set((state) => {
    // Deduplicate: Don't add if identical to the most recent item
    if (state.clipboardHistory.length > 0 && state.clipboardHistory[0].content === content) {
      return {};
    }

    const type = content.includes('<qdrant-search>') ? 'xml-command' 
               : content.includes('```') ? 'code' 
               : 'text';

    const newItem: ClipboardHistoryItem = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
      type
    };

    // Keep last 20 items
    return { clipboardHistory: [newItem, ...state.clipboardHistory].slice(0, 20) };
  }),
  clearClipboardHistory: () => set({ clipboardHistory: [] }),
}));