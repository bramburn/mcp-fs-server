import {
  Button,
  Input,
  makeStyles,
  ProgressBar,
  shorthands,
  Text,
  Textarea,
  ToggleButton,
  tokens,
  Tooltip,
  Checkbox,
} from "@fluentui/react-components";
import {
  ArrowRepeatAllRegular,
  CopyRegular,
  CutRegular,
  DocumentCopyRegular,
  FilterRegular,
  FolderOpenRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FileSnippetResult,
  SearchRequestParams,
  SearchResponseParams,
  IndexStatus // Import the type
} from "../../protocol.js";
import {
  COPY_RESULTS_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  GET_SEARCH_SETTINGS_METHOD,
  type GetSearchSettingsResponse,
  SEARCH_METHOD,
  START_INDEX_METHOD,
  INDEX_STATUS_METHOD // Import the method for polling
} from "../../protocol.js";
import SnippetList from "../components/SnippetList.js";
import { useIpc } from "../contexts/ipc.js";
import { useAppStore } from "../store.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.padding("12px"),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1),
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  upperSection: {
    flex: "1 0 15vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    ...shorthands.padding("0", "24px"),
  },
  searchSection: {
    ...shorthands.padding("0", "24px", "12px"),
  },
  searchArea: {
    width: "100%",
    ...shorthands.margin("0", "0", "12px"),
  },
  searchInput: {
    minHeight: "96px", // 3-4 rows
    maxHeight: "160px", // limit max height
    width: "100%",
    resize: "vertical",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    ...shorthands.padding("12px", "24px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke1),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1),
  },
  // Added missing toggleGroup style
  toggleGroup: {
    display: "flex",
    flexDirection: "row",
    ...shorthands.gap("4px"),
  },
  // Added missing statusRow style
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("8px", "24px"),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1),
  },
  statusText: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("6px"),
    fontSize: "11px",
    color: tokens.colorNeutralForeground3,
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: tokens.borderRadiusCircular,
  },
  scrollArea: {
    flexGrow: 1,
    overflowY: "auto",
    ...shorthands.padding("0", "24px", "24px"),
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    ...shorthands.gap("16px"),
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    padding: "20px",
  },
  prominentButton: {
    height: "36px",
    padding: "0 20px",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
});

export default function Search() {
  const styles = useStyles();
  const ipc = useIpc();

  // Cast state to specific type
  const indexStatus = useAppStore((state) => state.indexStatus) as IndexStatus; 
  const indexStats = useAppStore((state) => state.indexStats);
  
  // const setView = useAppStore((state) => state.setView); // Retained but not used for navigation

  const [searchInput, setSearchInput] = useState("");
  const [globFilter, setGlobFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<FileSnippetResult[]>([]);
  const [copyMode, setCopyMode] = useState<"files" | "snippets">("files");

  // Load search settings from VS Code configuration
  const [maxResults, setMaxResults] = useState(10);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [includeQueryInCopy, setIncludeQueryInCopy] = useState(false);

  // New Guidance Filter
  const [includeGuidance, setIncludeGuidance] = useState(false);

  // Use a ref to track the latest search input value
  const searchInputRef = useRef(searchInput);

  // Update ref whenever searchInput changes
  useEffect(() => {
    searchInputRef.current = searchInput;
  }, [searchInput]);

  // Load search settings on mount and when they change
  const loadSearchSettings = useCallback(() => {
    ipc
      .sendRequest<Record<string, never>, GetSearchSettingsResponse>(
        GET_SEARCH_SETTINGS_METHOD,
        "qdrantIndex",
        {}
      )
      .then((settings) => {
        if (settings) {
          setMaxResults(settings.limit);
          setScoreThreshold(settings.threshold);
          if (settings.includeQueryInCopy !== undefined) {
            setIncludeQueryInCopy(settings.includeQueryInCopy);
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load search settings: ", error);
      });
  }, [ipc]);

  useEffect(() => {
    loadSearchSettings();
  }, [loadSearchSettings]);

  // Listen for configuration changes from other views
  useEffect(() => {
    const handleConfigChange = (params: any) => {
      if (params?.section === "search") {
        loadSearchSettings();
      }
    };

    ipc.onNotification(DID_CHANGE_CONFIG_NOTIFICATION, handleConfigChange);
  }, [ipc, loadSearchSettings]);

  // Poll status on mount
  useEffect(() => {
      // Send a command to refresh status specifically when view loads
      ipc.sendCommand(INDEX_STATUS_METHOD, "qdrantIndex", {});
  }, [ipc]);

  const handleCopyContext = useCallback(() => {
    if (!results.length) return;
    ipc.sendCommand(COPY_RESULTS_METHOD, "qdrantIndex", {
      mode: copyMode,
      results,
      query: searchInput,
      includeQuery: includeQueryInCopy,
    });
  }, [ipc, results, copyMode, searchInput, includeQueryInCopy]);

  const executeSearch = useCallback(
    async (query: string, options?: { limit?: number; threshold?: number }) => {
      const trimmed = query?.trim() ?? "";

      if (trimmed.length <= 2) return;

      setIsLoading(true);

      try {
        const response = await ipc.sendRequest<
          SearchRequestParams,
          SearchResponseParams
        >(SEARCH_METHOD, "qdrantIndex", {
          query: trimmed,
          limit: options?.limit ?? maxResults,
          globFilter: globFilter || undefined,
          includeGuidance: includeGuidance
        });

        const allResults = response?.results ?? [];
        const threshold = options?.threshold ?? scoreThreshold;

        // Filter by threshold, but if no results pass, show all results anyway
        let filteredResults = allResults.filter((r) => r.score >= threshold);

        // If no results pass the threshold, show all results
        if (filteredResults.length === 0 && allResults.length > 0) {
          filteredResults = allResults;
        }

        setResults(filteredResults);
      } catch (error) {
        console.error("Search request failed: ", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [ipc, maxResults, scoreThreshold, globFilter, includeGuidance]
  );

  const handleSearchClick = () => {
    if (searchInput.trim().length > 2) {
      executeSearch(searchInput, {
        limit: maxResults,
        threshold: scoreThreshold,
      });
    }
  };

  // Clear results when input is cleared
  useEffect(() => {
    if (searchInput.length === 0) {
      setResults([]);
    }
  }, [searchInput]);

  const handleSearchValueChange = useCallback((value: string) => {
    setSearchInput(value);
    searchInputRef.current = value;
  }, []);

  useEffect(() => {
    if (indexStatus === "indexing") {
      setIsLoading(true);
    }
  }, [indexStatus]);

  const handleIndex = useCallback(() => {
    ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {});
  }, [ipc]);

  const getStatusColor = () => {
    switch (indexStatus) {
        case "ready": return tokens.colorPaletteGreenBackground3;
        case "stale": return tokens.colorPaletteYellowBackground3; // Yellow for stale
        case "indexing": return tokens.colorPaletteBlueBackground2; // Use background 2
        case "notIndexed": return tokens.colorPaletteRedBackground3; // Red for not indexed
        case "error": return tokens.colorPaletteRedBackground3;
        default: return tokens.colorNeutralBackground3;
    }
  };

  const getStatusText = () => {
      switch (indexStatus) {
          case "ready": return "Index Ready";
          case "stale": return "Index Stale (New Commits)";
          case "indexing": return "Indexing...";
          case "notIndexed": return "Not Indexed";
          case "error": return "Index Error";
          default: return "Unknown";
      }
  };

  // 1. Handle No Workspace State
  if (indexStatus === "no_workspace") {
    return (
      <div className={styles.emptyState}>
        <div
          style={{
            padding: "16px",
            backgroundColor: tokens.colorNeutralBackground2,
            borderRadius: "50%",
          }}
        >
          <FolderOpenRegular
            fontSize={32}
            color={tokens.colorNeutralForeground3}
          />
        </div>
        <div>
          <Text weight="semibold" size={400} block>
            No Workspace Open
          </Text>
          <Text size={200}>Open a folder or workspace to start searching.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Text weight="semibold" size={400}>
            Semantic Search
          </Text>
          {/* REMOVED SETTINGS BUTTON */}
        </div>
      </div>

      {/* Upper empty space and instructions */}
      <div className={styles.upperSection}>
        <Text weight="semibold" size={500}>
          SEMANTIC CODE SEARCH
        </Text>
        <Text
          size={300}
          style={{ color: tokens.colorNeutralForeground3, marginTop: "8px" }}
        >
          Find relevant code using natural language queries
        </Text>
      </div>

      {/* Search Section */}
      <div className={styles.searchSection}>
        <div className={styles.searchArea}>
          <Textarea
            className={styles.searchInput}
            placeholder="Search your codebase with natural language queries..."
            value={searchInput}
            onChange={(_e, data) => handleSearchValueChange(data.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                searchInput.trim().length > 2
              ) {
                // Prevent form submission/newline insertion on simple Enter
                e.preventDefault();
                handleSearchClick();
              }
            }}
            appearance="outline"
            resize="vertical"
          />

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}> {/* ADDED MARGIN-TOP */}
            <Input
                placeholder="File filter (e.g. **/*.ts,*.py)"
                contentAfter={<FilterRegular />}
                value={globFilter}
                onChange={(_e, data) => setGlobFilter(data.value)}
                size="small"
                style={{ flexGrow: 1 }}
            />
            <Checkbox
                label="Include Guidance"
                checked={includeGuidance}
                onChange={(_, d) => setIncludeGuidance(!!d.checked)}
            />
            {/* ADDED SEARCH BUTTON */}
            <Button
                appearance="primary"
                icon={<SearchRegular />}
                onClick={handleSearchClick}
                disabled={searchInput.trim().length < 3 || isLoading}
            >
                Search
            </Button>
          </div>
        </div>
      </div>

      {/* Results Toolbar */}
      <div className={styles.controlsRow}>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {results.length} result{results.length !== 1 ? "s" : ""}
        </Text>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className={styles.toggleGroup}>
            <Tooltip content="Copy file paths" relationship="label">
              <ToggleButton
                size="small"
                appearance="subtle"
                checked={copyMode === "files"}
                onClick={() => setCopyMode("files")}
                icon={<DocumentCopyRegular fontSize={16} />}
              >
                  Files
              </ToggleButton>
            </Tooltip>
            <Tooltip content="Copy snippets" relationship="label">
              <ToggleButton
                size="small"
                appearance="subtle"
                checked={copyMode === "snippets"}
                onClick={() => setCopyMode("snippets")}
                icon={<CutRegular fontSize={16} />}
              >
                  Snippets
              </ToggleButton>
            </Tooltip>
          </div>

          <Button
            size="large"
            appearance="primary"
            disabled={results.length === 0}
            onClick={handleCopyContext}
            icon={<CopyRegular />}
            className={styles.prominentButton}
          >
            COPY CONTEXT
          </Button>
        </div>
      </div>

      {/* Status Footer */}
      <div className={styles.statusRow}>
        <div className={styles.statusText}>
          <div
            className={styles.dot}
            style={{ backgroundColor: getStatusColor() }}
          />
          <Text>{getStatusText()}</Text>
          
          {/* Show vector count if available */}
          {indexStats?.vectorCount !== undefined && (
            <Text size={100} style={{ opacity: 0.7 }}>
              ({indexStats.vectorCount} vectors)
            </Text>
          )}
        </div>

        <Button
          size="small"
          appearance={indexStatus === 'stale' || indexStatus === 'notIndexed' ? "primary" : "subtle"} // Highlight if action needed
          icon={<ArrowRepeatAllRegular />}
          disabled={indexStatus === "indexing"}
          onClick={handleIndex}
        >
          {indexStatus === 'notIndexed' ? "Start Indexing" : "Re-Index"}
        </Button>
      </div>

      {isLoading && <ProgressBar />}

      {/* Results List */}
      <div className={styles.scrollArea}>
        {!isLoading && results.length === 0 && searchInput.length > 0 && (
          <div
            className={styles.emptyState}
            style={{ height: "auto", marginTop: "40px" }}
          >
            <Text>
              {searchInput.length > 2
                ? "No results found."
                : "Type at least 3 characters..."}
            </Text>
          </div>
        )}

        {!isLoading && results.length === 0 && searchInput.length === 0 && (
          <div
            className={styles.emptyState}
            style={{ height: "auto", marginTop: "40px" }}
          >
            <Text style={{ color: tokens.colorNeutralForeground4 }}>
              Start typing to search...
            </Text>
          </div>
        )}

        <SnippetList results={results} />
      </div>
    </div>
  );
}