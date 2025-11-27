import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { useIpc } from '../contexts/ipc';
import { SEARCH_METHOD, START_INDEX_METHOD, COPY_RESULTS_METHOD } from '../../protocol';
import type { SearchRequestParams, SearchResponseParams, FileSnippetResult } from '../../protocol';
import SnippetList from '../components/SnippetList';
import { Button } from '../components/ui/button';
import { FileText, Scissors, Copy } from 'lucide-react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandLoading,
} from '../components/ui/command';

export default function Search() {
  const ipc = useIpc();

  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<FileSnippetResult[]>([]);
  const [copyMode, setCopyMode] = useState<'files' | 'snippets'>('files');

  const handleCopyContext = useCallback(() => {
    if (!results.length) return;
    ipc.sendCommand(COPY_RESULTS_METHOD, 'qdrantIndex', {
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
            'qdrantIndex',
            { query: searchInput }
          )
          .then((response) => {
            setResults(response.results ?? []);
            setIsLoading(false);
          })
          .catch((error) => {
            console.error('Search request failed:', error);
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
    if (indexStatus === 'indexing') {
      setIsLoading(true);
    }
  }, [indexStatus]);

  const handleIndex = useCallback(() => {
    ipc.sendCommand(START_INDEX_METHOD, 'qdrantIndex', {});
  }, [ipc]);

  const openSettings = useCallback(() => {
    setView('settings');
  }, [setView]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground/80">
              Semantic Code Search
            </h2>
            <Button variant="link" size="sm" onClick={openSettings} className="text-xs">
              Settings
            </Button>
          </div>

          <Command value={searchInput} onValueChange={setSearchInput} filter={() => 1}>
            <CommandInput placeholder="Search codebase..." />

            {/* Results Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                {results.length === 0
                  ? 'No results'
                  : `${results.length} result${results.length !== 1 ? 's' : ''}`}
              </span>

              <div className="flex items-center gap-1">
                <div className="flex bg-muted rounded-md p-0.5 mr-2">
                  <button
                    onClick={() => setCopyMode('files')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-all ${
                      copyMode === 'files'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Copy full file content"
                  >
                    <FileText className="w-3 h-3" />
                    Files
                  </button>
                  <button
                    onClick={() => setCopyMode('snippets')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-all ${
                      copyMode === 'snippets'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
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
              {!isLoading && results.length === 0 && searchInput.length === 0 && (
                <CommandEmpty>Start typing to search...</CommandEmpty>
              )}
              {!isLoading && results.length === 0 && searchInput.length > 2 && (
                <CommandEmpty>No results found for "{searchInput}".</CommandEmpty>
              )}
            </CommandList>
          </Command>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  indexStatus === 'ready'
                    ? 'bg-green-500'
                    : indexStatus === 'indexing'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              <span>
                {indexStatus === 'indexing' ? 'Indexing...' : 'Index Ready'}
              </span>
            </div>

            <Button
              onClick={handleIndex}
              disabled={indexStatus === 'indexing'}
              size="sm"
              variant="default"
            >
              {indexStatus === 'indexing' ? 'Indexing...' : 'Re-Index'}
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