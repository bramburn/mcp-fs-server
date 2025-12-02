import {
  Button,
  Card,
  CardHeader,
  makeStyles,
  Text,
  tokens,
  Badge,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  BugRegular,
  ClipboardCodeRegular,
  DocumentErrorRegular,
  CopyRegular,
  DeleteRegular,
  ChatRegular
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  DEBUG_ANALYZE_METHOD,
  DEBUG_COPY_METHOD,
  type DebugAnalyzeResponse,
} from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";
import { useAppStore } from "../store.js";
import { ActionCard } from "../components/ActionCard.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    padding: "24px",
    overflow: "auto",
    gap: "24px"
  },
  header: {
    marginBottom: "12px",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "12px",
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
  activeFileCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "8px"
  },
  promptArea: {
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackgroundAlpha,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px dashed ${tokens.colorBrandStroke1}`,
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
});

const SYSTEM_PROMPT = `You are an advanced coding assistant. 
Protocol:
1. To search: <qdrant-search>query</qdrant-search>
2. To edit/create: <qdrant-file path="path">code</qdrant-file>
Do not ask to paste code. Use search tags.`;

export default function Debugger() {
  const styles = useStyles();
  const ipc = useIpc();
  
  // Store state
  const clipboardHistory = useAppStore(state => state.clipboardHistory);
  const clearHistory = useAppStore(state => state.clearClipboardHistory);

  const [analyzeState, setAnalyzeState] = useState<DebugAnalyzeResponse | null>(null);
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
    fetchAnalysis();
    const handleRefreshCommand = () => fetchAnalysis();
    ipc.onNotification("debug/refresh-analysis", handleRefreshCommand);
  }, [fetchAnalysis, ipc]);

  const handleCopyContext = () => {
    ipc.sendCommand(DEBUG_COPY_METHOD, "debugger", { includePrompt: true });
  };

  const copySystemPrompt = () => {
      navigator.clipboard.writeText(SYSTEM_PROMPT);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Paste-Driven Development</div>
        <Text>Interact with AI via clipboard automation.</Text>
      </div>

      {/* 1. System Prompt Generator */}
      <div className={styles.section}>
          <div className={styles.sectionTitle}>
              <ChatRegular />
              1. Setup AI Context
          </div>
          <div className={styles.promptArea}>
              <Text size={200}>
                  Copy these instructions and paste them into ChatGPT or Gemini at the start of your session.
                  This enables the AI to control your editor via tags like <code>&lt;qdrant-search&gt;</code>.
              </Text>
              <Button 
                appearance="primary" 
                size="small" 
                icon={<CopyRegular />}
                onClick={copySystemPrompt}
              >
                  Copy Meta-Prompt Instructions
              </Button>
          </div>
      </div>

      {/* 2. Active File Errors (Source of Truth) */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <BugRegular />
          2. Active File Analysis
        </div>
        
        <Card className={styles.activeFileCard}>
          <CardHeader
            header={<Text weight="semibold">{analyzeState?.fileName || "No Active File"}</Text>}
            action={
              <Button
                appearance="subtle"
                icon={<ArrowClockwiseRegular />}
                onClick={fetchAnalysis}
                disabled={isRefreshing}
              />
            }
          />
          <div style={{ padding: "0 12px 12px 12px" }}>
            {analyzeState?.hasActiveEditor ? (
              <>
                <div style={{ marginBottom: "12px", display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(analyzeState.errorCount ?? 0) > 0 ? (
                    <Badge color="danger" icon={<DocumentErrorRegular />}>
                      {analyzeState.errorCount} Issues
                    </Badge>
                  ) : (
                    <Badge color="success">No Issues</Badge>
                  )}
                </div>
                <Button
                  appearance="secondary"
                  icon={<ClipboardCodeRegular />}
                  onClick={handleCopyContext}
                  style={{ width: "100%" }}
                >
                  Copy Context & Errors
                </Button>
              </>
            ) : (
              <Text size={200} style={{ opacity: 0.7 }}>Focus a file to see diagnostics.</Text>
            )}
          </div>
        </Card>
      </div>

      {/* 3. Clipboard History */}
      <div className={styles.section} style={{ flexGrow: 1 }}>
        <div className={styles.sectionTitle} style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center'}}>
                <ClipboardCodeRegular />
                Recent Clipboard
            </div>
            <Button 
                appearance="subtle" 
                icon={<DeleteRegular />} 
                size="small"
                onClick={clearHistory}
                disabled={clipboardHistory.length === 0}
            />
        </div>
        
        <div className={styles.historyList}>
            {clipboardHistory.length === 0 && (
                <Text align="center" style={{ padding: '20px', opacity: 0.5 }}>
                    History is empty. Copy text to see it here.
                </Text>
            )}
            {clipboardHistory.map(item => (
                <div key={item.id}>
                    {/* Render Action Actions vs Plain Text */}
                    {item.parsedActions && item.parsedActions.length > 0 ? (
                        item.parsedActions.map(action => (
                            <ActionCard 
                                key={action.id} 
                                action={action} 
                                timestamp={item.timestamp} 
                            />
                        ))
                    ) : (
                        // Fallback for plain text
                        <div 
                            className={styles.promptArea} 
                            style={{ cursor: 'pointer', opacity: 0.7 }}
                            onClick={() => navigator.clipboard.writeText(item.originalContent)}
                        >
                            <Text size={100} font="monospace">
                                {item.originalContent.substring(0, 100)}...
                            </Text>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}