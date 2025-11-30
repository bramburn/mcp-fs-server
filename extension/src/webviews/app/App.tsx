import {
  makeStyles,
  shorthands,
  Tab,
  TabList,
  tokens,
} from "@fluentui/react-components";
import {
  SearchRegular,
  SettingsRegular,
  BugRegular,
} from "@fluentui/react-icons";
import { useEffect } from "react";
import type {
  IndexStatusParams,
  IpcMessage,
  IpcNotification,
  QdrantOllamaConfig,
  SearchResponseParams,
} from "../protocol.js";
import {
  CONFIG_DATA_METHOD,
  INDEX_STATUS_METHOD,
  LOAD_CONFIG_METHOD,
  SEARCH_METHOD,
} from "../protocol.js";
import CommandPaletteTest from "./components/CommandPaletteTest.js";
import { IpcProvider } from "./contexts/ipc.js";
import { useVSCodeApi } from "./hooks/useVSCodeApi.js";
import { createHostIpc } from "./lib/vscode.js";
import { FluentWrapper } from "./providers/FluentWrapper.js";
import { useAppStore } from "./store.js";
import Debugger from "./views/Debugger.js";
import Search from "./views/Search.js";
import Settings from "./views/Settings.js";

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
  header: {
    display: "flex",
    alignItems: "center",
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    position: "sticky",
    top: 0,
    zIndex: 10,
    flexShrink: 0,
  },
  tabList: {
    width: "100%",
    display: "flex",
    alignItems: "center",
  },
  tabWrapper: {
    display: "flex",
    alignItems: "center",
    height: "100%",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  viewContainer: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
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
  const setView = useAppStore((state) => state.setView);
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
          {/* Tab Navigation Header */}
          <div className={styles.header}>
            <div className={styles.tabWrapper}>
              <TabList
                selectedValue={view}
                onTabSelect={(event, data) => {
                  setView(data.value as "search" | "debugger" | "settings");
                }}
                className={styles.tabList}
              >
                <Tab
                  value="search"
                  icon={<SearchRegular />}
                  data-testid="tab-search"
                >
                  Search
                </Tab>
                <Tab
                  value="debugger"
                  icon={<BugRegular />}
                  data-testid="tab-debugger"
                >
                  Debugger
                </Tab>
                <Tab
                  value="settings"
                  icon={<SettingsRegular />}
                  data-testid="tab-settings"
                >
                  Settings
                </Tab>
              </TabList>
            </div>
          </div>

          {/* Content Area */}
          <div className={styles.content}>
            <div className={styles.viewContainer}>
              {view === "search" && <Search />}
              {view === "debugger" && <Debugger />}
              {view === "settings" && <Settings />}
              {/* Note: CommandPaletteTest likely needs refactoring if it uses Tailwind/Shadcn */}
              {view === "test" && <CommandPaletteTest />}

              {view !== "search" &&
                view !== "debugger" &&
                view !== "settings" &&
                view !== "test" && (
                  <div className={styles.genericView}>Unknown view</div>
                )}
            </div>
          </div>
        </main>
      </IpcProvider>
    </FluentWrapper>
  );
}
