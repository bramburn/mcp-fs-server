import {
  Button,
  Card,
  CardHeader,
  makeStyles,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  BugRegular,
  ClipboardCodeRegular,
  DocumentErrorRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  DEBUG_ANALYZE_METHOD,
  DEBUG_COPY_METHOD,
  type DebugAnalyzeResponse,
} from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    padding: "24px",
    overflow: "auto",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "12px",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  sectionTitle: {
    fontWeight: "600",
    fontSize: "14px",
    color: tokens.colorNeutralForeground1,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  debugInfo: {
    fontFamily: "monospace",
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    padding: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    maxHeight: "200px",
    overflowY: "auto",
  },
  activeFileCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  errorBadge: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  okBadge: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: "bold",
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px",
  },
});

export default function Debugger() {
  const styles = useStyles();
  const ipc = useIpc();

  const [analyzeState, setAnalyzeState] = useState<DebugAnalyzeResponse | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await ipc.sendRequest<any, DebugAnalyzeResponse>(
        DEBUG_ANALYZE_METHOD,
        "debugger",
        {}
      );
      setAnalyzeState(response);
    } catch (e) {
      console.error("Failed to fetch debug analysis", e);
    } finally {
      setIsRefreshing(false);
    }
  }, [ipc]);

  useEffect(() => {
    // 1. Initial fetch on load
    fetchAnalysis();

    // 2. Listen for push updates from DebugMonitor (Host -> Guest command)
    const handleRefreshCommand = () => {
      fetchAnalysis();
    };

    // The host sends a command when the active editor or diagnostics change.
    // We register a listener for this command's method.
    ipc.onNotification("debug/refresh-analysis", handleRefreshCommand);

    // We do NOT use setInterval/polling anymore, relying entirely on the host monitor.
    // Cleanup interval removed.

    return () => {
      // Note: Removing listeners registered via onNotification is complex
      // without a proper deregistration function in useIpc/createHostIpc.
      // For standard IPC usage, this is typically handled by the VS Code webview lifecycle,
      // but if this component unmounts, the component instance's handler reference
      // should ideally be removed from the global window listener.
      // Assuming current `onNotification` implementation doesn't return a cleanup function.
    };
  }, [fetchAnalysis, ipc]);

  const handleCopyContext = () => {
    ipc.sendCommand(DEBUG_COPY_METHOD, "debugger", { includePrompt: true });
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Debugger</div>
        <Text>Debug information and diagnostics</Text>
      </div>

      <div className={styles.content}>
        {/* Active File Debugging */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <BugRegular />
            Active File Debugging
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Detect errors in the active file and prepare context for AI
            assistance.
          </Text>

          <Card className={styles.activeFileCard}>
            <CardHeader
              header={
                <Text weight="semibold">
                  {analyzeState?.fileName || "No Active File"}
                </Text>
              }
              description={
                <Text size={200} style={{ opacity: 0.7 }}>
                  {analyzeState?.filePath || "Open a file to start debugging"}
                </Text>
              }
              action={
                <Button
                  appearance="subtle"
                  icon={<ArrowClockwiseRegular />}
                  onClick={fetchAnalysis}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </Button>
              }
            />

            <div style={{ padding: "0 12px 12px 12px" }}>
              {analyzeState?.hasActiveEditor ? (
                <>
                  <div style={{ marginBottom: "12px" }}>
                    {(analyzeState.errorCount ?? 0) > 0 ? (
                      <span className={styles.errorBadge}>
                        <DocumentErrorRegular />
                        {analyzeState.errorCount} Issues Found
                      </span>
                    ) : (
                      <span className={styles.okBadge}>No Issues Detected</span>
                    )}
                  </div>

                  <Button
                    appearance="primary"
                    icon={<ClipboardCodeRegular />}
                    onClick={handleCopyContext}
                    style={{ width: "100%" }}
                    disabled={isRefreshing}
                  >
                    Copy Context for AI ({analyzeState.errorCount}{" "}
                    Errors/Warnings)
                  </Button>
                  <Text
                    size={100}
                    style={{
                      marginTop: "8px",
                      display: "block",
                      textAlign: "center",
                      color: tokens.colorNeutralForeground3,
                    }}
                  >
                    Copies active file & errors to clipboard as a markdown
                    attachment.
                  </Text>
                </>
              ) : (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: tokens.colorNeutralForeground3,
                  }}
                >
                  Focus a file in the editor to see details.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Configuration Summary (Existing) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>System Status</div>
          <div className={styles.debugInfo}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>IPC Status:</span>
              <span style={{ color: tokens.colorPaletteGreenForeground1 }}>
                Connected
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>Platform:</span>
              <span>{navigator.platform}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Timestamp:</span>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
