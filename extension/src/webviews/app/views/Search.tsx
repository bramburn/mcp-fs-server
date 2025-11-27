import { Copy, FileText, FolderOpen, Scissors } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  FileSnippetResult,
  SearchRequestParams,
  SearchResponseParams,
} from "../../protocol";
import {
  COPY_RESULTS_METHOD,
  SEARCH_METHOD,
  START_INDEX_METHOD,
} from "../../protocol";
import SnippetList from "../components/SnippetList";
import { Button } from "../components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  CommandLoading,
} from "../components/ui/command";
import { useIpc } from "../contexts/ipc";
import { useAppStore } from "../store";

export default function Search() {
  const ipc = useIpc();

  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  const [searchInput, setSearchInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<FileSnippetResult[]>([]);
  const [copyMode, setCopyMode] = useState<"files" | "snippets">("files");

  const handleCopyContext = useCallback(() => {
    if (!results.length) return;
    ipc.sendCommand(COPY_RESULTS_METHOD, "qdrantIndex", {
      mode: copyMode,
      results,
    });
  }, [ipc, results, copyMode]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (searchInput.length > 2) {
      timer = setTimeout(() => {
        setIsLoading(true);
        ipc
          .sendRequest<SearchRequestParams, SearchResponseParams>(
            SEARCH_METHOD,
            "qdrantIndex",
            { query: searchInput }
          )
          .then((response) => {
            setResults(response.results ?? []);
            setIsLoading(false);
          })
          .catch((error) => {
            console.error("Search request failed:", error);
            setIsLoading(false);
          });
      }, 300);
    } else if (searchInput.length === 0) {
      setResults([]);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [searchInput, ipc]);

  useEffect(() => {
    if (indexStatus === "indexing") {
      setIsLoading(true);
    }
  }, [indexStatus]);

  const handleIndex = useCallback(() => {
    ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {});
  }, [ipc]);

  const openSettings = useCallback(() => {
    setView("settings");
  }, [setView]);

  // 1. Handle No Workspace State
  if (indexStatus === "no_workspace") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="bg-muted p-4 rounded-full">
          <FolderOpen
            className="w-8 h-8 text-muted-foreground"
            data-testid="icon-folder-open"
          />
        </div>
        <div>
          <h3 className="font-semibold text-base">No Workspace Open</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Open a folder or workspace to start searching your codebase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex flex-col gap-2 p-3">
          {" "}
          {/* Reduced padding p-4 -> p-3 */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground/80">
              Semantic Search
            </h2>
            <Button
              variant="link"
              size="sm"
              onClick={openSettings}
              className="text-xs px-0 h-auto"
            >
              Settings
            </Button>
          </div>
          <Command
            value={searchInput}
            onValueChange={setSearchInput}
            filter={() => 1}
          >
            <CommandInput
              placeholder="Search codebase..."
              className="text-xs h-9"
            />

            {/* Results Toolbar - Responsive Flex */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-border/40 bg-muted/20 text-xs">
              <span className="text-muted-foreground whitespace-nowrap">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </span>

              <div className="flex items-center gap-1 ml-auto">
                <div className="flex bg-muted rounded-md p-0.5 mr-2">
                  <button
                    onClick={() => setCopyMode("files")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-all ${
                      copyMode === "files"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Copy full file content"
                  >
                    <FileText className="w-3 h-3" />
                    Files
                  </button>
                  <button
                    onClick={() => setCopyMode("snippets")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-all ${
                      copyMode === "snippets"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Copy only snippets"
                  >
                    <Scissors className="w-3 h-3" />
                    Snippets
                  </button>
                </div>

                <Button
                  size="sm"
                  variant="default"
                  disabled={results.length === 0}
                  onClick={handleCopyContext}
                  className="h-6 px-2 text-[10px] gap-1.5"
                >
                  <Copy className="w-3 h-3" />
                  Copy Context
                </Button>
              </div>
            </div>

            <CommandList>
              {isLoading && <CommandLoading />}
              {!isLoading &&
                results.length === 0 &&
                searchInput.length === 0 && (
                  <CommandEmpty>Start typing to search...</CommandEmpty>
                )}
              {!isLoading && results.length === 0 && searchInput.length > 2 && (
                <CommandEmpty>
                  No results found for "{searchInput}".
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
          {/* Footer Status - Stack on very small screens */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  indexStatus === "ready"
                    ? "bg-green-500"
                    : indexStatus === "indexing"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="truncate">
                {indexStatus === "indexing" ? "Indexing..." : "Index Ready"}
              </span>
            </div>

            <Button
              onClick={handleIndex}
              disabled={indexStatus === "indexing"}
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
            >
              Re-Index
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <SnippetList results={results} />
      </div>
    </div>
  );
}
