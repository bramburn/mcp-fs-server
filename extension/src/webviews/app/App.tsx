import { useEffect } from "react";
import type {
  IndexStatusParams,
  IpcMessage,
  IpcNotification,
  QdrantOllamaConfig,
  SearchResponseParams,
} from "../protocol";
import {
  CONFIG_DATA_METHOD,
  INDEX_STATUS_METHOD,
  LOAD_CONFIG_METHOD,
  SEARCH_METHOD,
} from "../protocol";
import CommandPaletteTest from "./components/CommandPaletteTest";
import { IpcProvider } from "./contexts/ipc";
import { useVSCodeApi } from "./hooks/useVSCodeApi";
import { createHostIpc } from "./lib/vscode";
import { useAppStore } from "./store";
import Search from "./views/Search";
import Settings from "./views/Settings";

/**
 * Helper hook to sync VS Code theme classes on <body> with Tailwind's `dark` class.
 * This ensures Tailwind dark mode utilities respond to VS Code's active theme.
 */
function useThemeSync() {
  useEffect(() => {
    const syncTheme = () => {
      const body = document.body;
      // Check if VS Code is in dark mode or high contrast
      const isDark =
        body.classList.contains("vscode-dark") ||
        body.classList.contains("vscode-high-contrast");

      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          syncTheme();
        }
      }
    });

    // Initial sync
    syncTheme();
    observer.observe(document.body, { attributes: true });

    return () => observer.disconnect();
  }, []);
}

export default function App() {
  const vscodeApi = useVSCodeApi();
  const hostIpc = createHostIpc(vscodeApi);

  // Keep Tailwind's `dark` class in sync with VS Code theme classes
  useThemeSync();

  const view = useAppStore((state) => state.view);
  const setSearchResults = useAppStore((state) => state.setSearchResults);
  const setIndexStatus = useAppStore((state) => state.setIndexStatus);
  const setIndexProgress = useAppStore((state) => state.setIndexProgress);
  const setIndexStats = useAppStore((state) => state.setIndexStats);
  const setConfig = useAppStore((state) => state.setConfig);

  useEffect(() => {
    // Send ready notification when VS Code API is available
    if (vscodeApi) {
      try {
        vscodeApi.postMessage({
          id: "ready-request",
          scope: "webview-mgmt",
          method: "ipc:ready-request",
          params: undefined,
          kind: "command",
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Failed to send ipc:ready-request", error);
      }
    }

    // Initial config load
    hostIpc
      .sendRequest(LOAD_CONFIG_METHOD, "webview-mgmt", {})
      .catch((error) => {
        console.error("Failed to load initial config:", error);
      });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as IpcMessage;

      if (message.scope !== "webview-mgmt") return;

      if (message.kind === "notification") {
        const notification = message as IpcNotification<unknown>;

        switch (message.method) {
          case SEARCH_METHOD: {
            const params = notification.params as
              | SearchResponseParams
              | undefined;
            if (params) {
              setSearchResults(params.results ?? []);
            }
            break;
          }

          case INDEX_STATUS_METHOD: {
            const params = notification.params as IndexStatusParams | undefined;
            if (params) {
              setIndexStatus(params.status);
              if (typeof params.progress === "number") {
                setIndexProgress(params.progress);
              }
              if (params.stats) {
                setIndexStats(params.stats);
              }
            }
            break;
          }

          case CONFIG_DATA_METHOD: {
            const cfg =
              (notification.params as QdrantOllamaConfig | null) ?? undefined;
            setConfig(cfg);
            break;
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    vscodeApi,
    hostIpc,
    setSearchResults,
    setIndexStatus,
    setIndexProgress,
    setIndexStats,
    setConfig,
  ]);

  return (
    <IpcProvider value={hostIpc}>
      <main className="h-screen w-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-primary/30">
        {view === "search" && <Search />}
        {view === "settings" && <Settings />}
        {view === "test" && <CommandPaletteTest />}
        {view !== "search" && view !== "settings" && view !== "test" && (
          <div className="p-4">Unknown view</div>
        )}
      </main>
    </IpcProvider>
  );
}
