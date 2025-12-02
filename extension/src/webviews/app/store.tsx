import { create } from "zustand";
import { ClipboardHistoryItem, ParsedAction } from "../protocol.js";

// Re-export types for convenience in components
export type { ClipboardHistoryItem, ParsedAction };

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

  // Updated Clipboard History State
  clipboardHistory: ClipboardHistoryItem[];
  
  // Handles adding items (both plain text and parsed XML items)
  addClipboardItem: (item: ClipboardHistoryItem | string) => void;
  
  clearClipboardHistory: () => void;
  
  // Update the status of a specific action within a history item (e.g. after clicking Implement)
  updateActionStatus: (historyId: string, actionId: string, status: ParsedAction['status']) => void;
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
  addClipboardItem: (input) => set((state) => {
    let newItem: ClipboardHistoryItem;

    if (typeof input === 'string') {
        // 1. Handle String Input (Manual Copy)
        // Deduplicate based on content
        if (state.clipboardHistory.length > 0 && state.clipboardHistory[0].originalContent === input) {
            return {};
        }

        const type = input.includes('<qdrant-search>') ? 'xml-command' 
                   : input.includes('```') ? 'code' 
                   : 'text';

        newItem = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            originalContent: input, // Note: Protocol uses 'originalContent'
            type,
            parsedActions: [] // No actions for plain text
        };
    } else {
        // 2. Handle Structured Input (From ClipboardManager)
        if (state.clipboardHistory.length > 0 && state.clipboardHistory[0].originalContent === input.originalContent) {
            return {};
        }
        newItem = input;
    }

    // Keep last 20 items
    return { clipboardHistory: [newItem, ...state.clipboardHistory].slice(0, 20) };
  }),
  
  clearClipboardHistory: () => set({ clipboardHistory: [] }),

  updateActionStatus: (historyId, actionId, status) => set((state) => ({
      clipboardHistory: state.clipboardHistory.map(item => {
          if (item.id !== historyId) return item;
          return {
              ...item,
              parsedActions: item.parsedActions.map(action => 
                  action.id === actionId ? { ...action, status } : action
              )
          };
      })
  }))
}));