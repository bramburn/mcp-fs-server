import { makeStyles, tokens } from "@fluentui/react-components";
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
import { FluentWrapper } from "./providers/FluentWrapper";
import { useAppStore } from "./store";
import Search from "./views/Search";
import Settings from "./views/Settings";

// Define styles using Griffel (CSS-in-JS) to replace Tailwind classes
const useStyles = makeStyles({
  container: {
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    // These tokens automatically adjust based on the theme (Dark/Light/High Contrast)
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    boxSizing: "border-box",
  },
  // Optional: Generic padding for unknown views
  genericView: {
    padding: "16px",
  },
});

export default function App() {
  const styles = useStyles();
  const vscodeApi = useVSCodeApi();
  const hostIpc = createHostIpc(vscodeApi);

  const view = useAppStore((state) => state.view);
  const setSearchResults = useAppStore((state) => state.setSearchResults);
  const setIndexStatus = useAppStore((state) => state.setIndexStatus);
  const setIndexProgress = useAppStore((state) => state.setIndexProgress);
  const setIndexStats = useAppStore((state) => state.setIndexStats);
  const setConfig = useAppStore((state) => state.setConfig);

  // NOTE: useThemeSync() hook removed as FluentWrapper handles this automatically

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
        console.error(error);
      }
    }

    // Initial config load
    hostIpc
      .sendRequest(LOAD_CONFIG_METHOD, "webview-mgmt", {})
      .catch(console.error);

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as IpcMessage;
      if (message.scope !== "webview-mgmt") return;

      if (message.kind === "notification") {
        const notification = message as IpcNotification<unknown>;

        switch (message.method) {
          case SEARCH_METHOD: {
            const sParams = notification.params as SearchResponseParams;
            if (sParams) {
              setSearchResults(sParams.results ?? []);
            }
            break;
          }

          case INDEX_STATUS_METHOD: {
            const iParams = notification.params as IndexStatusParams;
            if (iParams) {
              setIndexStatus(iParams.status);
              if (typeof iParams.progress === "number") {
                setIndexProgress(iParams.progress);
              }
              if (iParams.stats) {
                setIndexStats(iParams.stats);
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
    <FluentWrapper>
      <IpcProvider value={hostIpc}>
        <main className={styles.container}>
          {view === "search" && <Search />}
          {view === "settings" && <Settings />}
          {/* Note: CommandPaletteTest likely needs refactoring if it uses Tailwind/Shadcn */}
          {view === "test" && <CommandPaletteTest />}
          
          {view !== "search" && view !== "settings" && view !== "test" && (
            <div className={styles.genericView}>Unknown view</div>
          )}
        </main>
      </IpcProvider>
    </FluentWrapper>
  );
}