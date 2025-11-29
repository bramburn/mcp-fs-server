import {
  Card,
  CardHeader,
  makeStyles,
  shorthands,
  Text,
  tokens,
} from "@fluentui/react-components";
import { 
  DocumentRegular, 
  ArrowEnterLeftRegular 
} from "@fluentui/react-icons";
import type { FileSnippetResult } from "../../protocol";
import { OPEN_FILE_METHOD } from "../../protocol";
import { useIpc } from "../contexts/ipc";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("8px"),
    width: "100%",
    marginTop: "8px",
  },
  card: {
    width: "100%",
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border("1px", "solid", "transparent"),
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
      ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1Hover),
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground2Pressed,
    }
  },
  cardHeader: {
    ...shorthands.padding("0px"), // Reset default padding
    marginBottom: "8px",
  },
  headerContent: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    ...shorthands.gap("8px"),
    overflow: "hidden",
  },
  filePath: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexGrow: 1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: "12px",
  },
  lineNumber: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("4px"),
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    flexShrink: 0,
  },
  codeBlock: {
    backgroundColor: tokens.colorNeutralBackground3, // Slightly darker/lighter depending on theme
    ...shorthands.padding("8px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "12px",
    overflowX: "auto",
    color: tokens.colorNeutralForeground2,
    margin: 0,
    maxHeight: "200px",
    whiteSpace: "pre",
  },
});

interface SnippetListProps {
  results: FileSnippetResult[];
}

export default function SnippetList({ results }: SnippetListProps) {
  const styles = useStyles();
  const ipc = useIpc();

  const openFile = (uri: string, line: number) => {
    ipc.sendCommand(OPEN_FILE_METHOD, "qdrantIndex", { uri, line });
  };

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      {results.map((result, i) => (
        <Card
          key={`${result.uri}-${result.lineStart}-${i}`}
          className={styles.card}
          size="small"
          onClick={() => openFile(result.uri, result.lineStart)}
        >
          <CardHeader
            className={styles.cardHeader}
            header={
              <div className={styles.headerContent}>
                <DocumentRegular fontSize={14} color={tokens.colorBrandForeground1} />
                <Text className={styles.filePath} weight="medium">
                  {result.filePath ?? "Unknown File"}
                </Text>
                <div className={styles.lineNumber}>
                  <ArrowEnterLeftRegular fontSize={12} />
                  <Text>{result.lineStart}</Text>
                </div>
              </div>
            }
          />

          <pre className={styles.codeBlock}>
            <code>{result.snippet ?? ""}</code>
          </pre>
        </Card>
      ))}
    </div>
  );
}