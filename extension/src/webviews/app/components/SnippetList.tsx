import { makeStyles, shorthands, tokens, Button } from "@fluentui/react-components";
import { DocumentRegular, CodeRegular, ArrowRightRegular } from "@fluentui/react-icons";
import { FileSnippetResult } from "../../protocol";
import { memo } from "react";

const useStyles = makeStyles({
  list: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("8px"),
  },
  resultItem: {
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding("12px"),
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      cursor: "pointer",
    },
    transition: "background-color 0.2s ease",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px",
  },
  filePath: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("6px"),
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  metadata: {
    display: "flex",
    ...shorthands.gap("12px"),
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  scoreBadge: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    ...shorthands.padding("2px", "6px"),
    fontSize: tokens.fontSizeBase200,
  },
  lineInfo: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("4px"),
  },
  viewButton: {
    height: "24px",
    ...shorthands.padding("0", "8px"),
  },
});

interface SnippetListProps {
  results: FileSnippetResult[];
  onResultClick?: (result: FileSnippetResult) => void;
}

function SnippetList({ results, onResultClick }: SnippetListProps) {
  const styles = useStyles();

  if (results.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      {results.map((result, index) => (
        <div 
          key={index} 
          className={styles.resultItem}
          onClick={() => onResultClick?.(result)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onResultClick?.(result);
            }
          }}
        >
          <div className={styles.header}>
            <div className={styles.filePath}>
              <DocumentRegular fontSize={16} />
              <span>{result.filePath}</span>
            </div>
            <Button
              appearance="subtle"
              icon={<ArrowRightRegular />}
              size="small"
              className={styles.viewButton}
              onClick={(e) => {
                e.stopPropagation();
                onResultClick?.(result);
              }}
            >
              View
            </Button>
          </div>
          
          <div className={styles.metadata}>
            <div className={styles.lineInfo}>
              <CodeRegular fontSize={12} />
              <span>Lines {result.lineStart}-{result.lineEnd}</span>
            </div>
            <div className={styles.scoreBadge}>
              Score: {(result.score * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(SnippetList);