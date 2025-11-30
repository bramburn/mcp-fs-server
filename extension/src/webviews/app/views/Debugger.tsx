import { makeStyles, tokens } from "@fluentui/react-components";
import { Text } from "@fluentui/react-components";

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
});

export default function Debugger() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Debugger</div>
        <Text>Debug information and diagnostics</Text>
      </div>

      <div className={styles.content}>
        {/* Environment Information */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Environment</div>
          <div className={styles.debugInfo}>
            Platform: {typeof window !== "undefined" ? "Browser" : "Node.js"}
            <br />
            User Agent: {typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}
            <br />
            Timestamp: {new Date().toISOString()}
          </div>
        </div>

        {/* Storage Information */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Storage Status</div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Check local storage and session data here
          </Text>
          <div className={styles.debugInfo}>
            LocalStorage Keys: {typeof window !== "undefined" ? Object.keys(localStorage).length : 0}
            <br />
            SessionStorage Keys: {typeof window !== "undefined" ? Object.keys(sessionStorage).length : 0}
          </div>
        </div>

        {/* Logging */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Application Logs</div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Real-time logs appear here
          </Text>
          <div className={styles.debugInfo}>
            [Info] Debugger view initialized
            <br />
            [Info] Ready to capture application events
          </div>
        </div>

        {/* Configuration */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Configuration</div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Active configuration details
          </Text>
          <div className={styles.debugInfo}>
            API Endpoint: http://localhost:11434
            <br />
            Model: nomic-embed-text
            <br />
            Index: codebase-index
          </div>
        </div>
      </div>
    </div>
  );
}