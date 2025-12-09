import {
  Button,
  Card,
  CardHeader,
  makeStyles,
  Text,
  tokens,
  Badge,
  Tab,
  TabList,
  SelectTabData,
  SelectTabEvent,
  Switch
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  BugRegular,
  ClipboardCodeRegular,
  DocumentErrorRegular,
  CopyRegular,
  DeleteRegular,
  ChatRegular,
  PlayRegular,
  StopRegular,
  EyeRegular,
  DatabaseRegular
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  DEBUG_ANALYZE_METHOD,
  DEBUG_COPY_METHOD,
  type DebugAnalyzeResponse,
  MONITOR_START_COMMAND,
  MONITOR_STOP_COMMAND,
  TOGGLE_CAPTURE_COMMAND,
  VECTORIZE_GUIDANCE_COMMAND,
  VIEW_CONTENT_COMMAND,
  GET_VSCODE_SETTINGS_METHOD,
  type VSCodeSettings
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
    padding: "12px",
    overflow: "auto",
    gap: "12px"
  },
  header: {
    marginBottom: "8px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "bold",
    marginBottom: "8px",
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
  clipboardItem: {
      padding: "8px",
      backgroundColor: tokens.colorNeutralBackground1,
      borderRadius: tokens.borderRadiusMedium,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
  },
  clipboardControls: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px'
  },
  timerBadge: {
      marginLeft: 'auto',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      color: tokens.colorBrandForeground1
  },
  toggleContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '8px',
      backgroundColor: tokens.colorNeutralBackground1,
      padding: '8px',
      borderRadius: tokens.borderRadiusMedium,
      border: `1px solid ${tokens.colorNeutralStroke1}`
  }
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

  // View State
  const [selectedTab, setSelectedTab] = useState<string>("smart-paste");

  // Analysis State
  const [analyzeState, setAnalyzeState] = useState<DebugAnalyzeResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Monitor State
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorEndTime, setMonitorEndTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const timerRef = useRef<number | undefined>(undefined);
  const [monitorDuration, setMonitorDuration] = useState(5); // Default
  
  // Capture All Toggle State
  const [captureAll, setCaptureAll] = useState(false);

  // Load monitor settings
  useEffect(() => {
    ipc.sendRequest<any, VSCodeSettings>(GET_VSCODE_SETTINGS_METHOD, "webview-mgmt", {}).then(settings => {
        if(settings) {
            setMonitorDuration(settings.clipboardMonitorDuration);
        }
    });
  }, [ipc]);


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

    // Listen for monitor stop from backend
    ipc.onNotification(MONITOR_STOP_COMMAND, () => {
        setIsMonitoring(false);
        setMonitorEndTime(null);
        setTimeRemaining("");
        if (timerRef.current) clearInterval(timerRef.current);
    });
  }, [fetchAnalysis, ipc]);

  // Timer Effect
  useEffect(() => {
      if (isMonitoring && monitorEndTime) {
          timerRef.current = window.setInterval(() => {
              const now = Date.now();
              const diff = monitorEndTime - now;
              if (diff <= 0) {
                  setTimeRemaining("00:00");
                  clearInterval(timerRef.current);
                  // Backend will send STOP command, but we can optimistically stop here too
              } else {
                  const m = Math.floor(diff / 60000);
                  const s = Math.floor((diff % 60000) / 1000);
                  setTimeRemaining(`${m}:${s.toString().padStart(2, '0')}`);
              }
          }, 1000);
      } else {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeRemaining("");
      }
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, [isMonitoring, monitorEndTime]);

  const handleCopyContext = () => {
    ipc.sendCommand(DEBUG_COPY_METHOD, "debugger", { includePrompt: true });
  };

  const copySystemPrompt = () => {
      navigator.clipboard.writeText(SYSTEM_PROMPT);
  };

  const toggleMonitor = () => {
      if (isMonitoring) {
          // Stop
          ipc.sendCommand(MONITOR_STOP_COMMAND, 'debugger', {});
          setIsMonitoring(false);
          setMonitorEndTime(null);
      } else {
          // Start
          ipc.sendCommand(MONITOR_START_COMMAND, 'debugger', { duration: monitorDuration });
          setIsMonitoring(true);
          setMonitorEndTime(Date.now() + monitorDuration * 60 * 1000);
      }
  };

  const handleCaptureAllToggle = (checked: boolean) => {
      setCaptureAll(checked);
      ipc.sendCommand(TOGGLE_CAPTURE_COMMAND, 'debugger', { enabled: checked });
  };

  const handleVectorize = (id: string, content: string) => {
      ipc.sendCommand(VECTORIZE_GUIDANCE_COMMAND, 'debugger', { id, content });
  };

  const handleViewContent = (content: string) => {
      ipc.sendCommand(VIEW_CONTENT_COMMAND, 'debugger', { content });
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Paste-Driven Development</div>
        <TabList
            selectedValue={selectedTab}
            onTabSelect={(_: SelectTabEvent, data: SelectTabData) => setSelectedTab(String(data.value))}
        >
            <Tab value="smart-paste">Smart Paste</Tab>
            <Tab value="clipboard-history">Clipboard History</Tab>
        </TabList>
      </div>

      {selectedTab === "smart-paste" && (
          <>
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

            {/* 3. Parsed Action History (Legacy/Automations) */}
            <div className={styles.section} style={{ flexGrow: 1 }}>
                <div className={styles.sectionTitle}>
                    <ClipboardCodeRegular />
                    Automation History
                </div>

                <div className={styles.historyList}>
                    {clipboardHistory.filter(i => i.type === 'xml-command').length === 0 && (
                        <Text align="center" style={{ padding: '20px', opacity: 0.5 }}>
                            No automation commands detected yet.
                        </Text>
                    )}
                    {clipboardHistory.filter(i => i.type === 'xml-command').map(item => (
                        <div key={item.id}>
                            {item.parsedActions.map(action => (
                                <ActionCard
                                    key={action.id}
                                    action={action}
                                    timestamp={item.timestamp}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
          </>
      )}

      {selectedTab === "clipboard-history" && (
          <div className={styles.section} style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
             <div className={styles.sectionTitle} style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Text weight="semibold">Clipboard History</Text>
                 </div>

                 <Button
                    appearance="subtle"
                    icon={<DeleteRegular />}
                    size="small"
                    onClick={clearHistory}
                    disabled={clipboardHistory.length === 0}
                    title="Clear History"
                 />
             </div>

             <div className={styles.toggleContainer}>
                 <Switch 
                    checked={captureAll}
                    onChange={(_, data) => handleCaptureAllToggle(data.checked)}
                    label="Capture All History (Text)"
                 />
                 <div style={{ borderLeft: `1px solid ${tokens.colorNeutralStroke1}`, height: '24px', margin: '0 8px' }}></div>
                 
                 <Button
                    appearance={isMonitoring ? "primary" : "secondary"}
                    size="small"
                    icon={isMonitoring ? <StopRegular /> : <PlayRegular />}
                    onClick={toggleMonitor}
                    style={{ backgroundColor: isMonitoring ? tokens.colorPaletteRedBackground3 : undefined }}
                 >
                    {isMonitoring ? "Stop Session" : "Start Session"}
                 </Button>
                 {isMonitoring && (
                    <Text className={styles.timerBadge}>{timeRemaining}</Text>
                 )}
             </div>

             <div className={styles.historyList} style={{ overflowY: 'auto' }}>
                 {clipboardHistory.length === 0 && (
                     <Text align="center" style={{ padding: '20px', opacity: 0.5 }}>
                         Clipboard history is empty. <br/> Enable "Capture All History" or copy automation tags.
                     </Text>
                 )}
                 {clipboardHistory.map(item => (
                     <div key={item.id} className={styles.clipboardItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Badge appearance="outline" color={item.type === 'xml-command' ? 'brand' : 'important'}>
                                {item.type === 'xml-command' ? 'Automation' : 'Text'}
                            </Badge>
                            <Text size={100} style={{ opacity: 0.6 }}>
                                {new Date(item.timestamp).toLocaleTimeString()}
                            </Text>
                        </div>

                        <Text font="monospace" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflow: 'hidden', opacity: 0.8 }}>
                            {item.originalContent.substring(0, 300)}
                            {item.originalContent.length > 300 && "..."}
                        </Text>

                        <div className={styles.clipboardControls}>
                            <Button size="small" icon={<EyeRegular />} onClick={() => handleViewContent(item.originalContent)}>
                                View
                            </Button>
                            <Button
                                size="small"
                                icon={<DatabaseRegular />}
                                onClick={() => handleVectorize(item.id, item.originalContent)}
                                disabled={!!item.guidanceId}
                            >
                                {item.guidanceId ? "Vectorized" : "Vectorize"}
                            </Button>
                            <Button size="small" icon={<CopyRegular />} onClick={() => navigator.clipboard.writeText(item.originalContent)}>
                                Copy
                            </Button>
                        </div>
                     </div>
                 ))}
             </div>
          </div>
      )}
    </div>
  );
}