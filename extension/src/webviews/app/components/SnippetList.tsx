import { useIpc } from '../contexts/ipc';
import { OPEN_FILE_METHOD } from '../../protocol';
import type { FileSnippetResult } from '../../protocol';
import {
  CommandItem,
} from '../components/ui/command';
import { FileCode, CornerDownRight } from 'lucide-react';

interface SnippetListProps {
  results: FileSnippetResult[];
}

export default function SnippetList({ results }: SnippetListProps) {
  const ipc = useIpc();

  const openFile = (uri: string, line: number) => {
    // Use the primary qdrantIndex IPC scope for open-file commands so that the
    // message conforms to the IpcScope union defined in protocol.ts.
    ipc.sendCommand(OPEN_FILE_METHOD, 'qdrantIndex', { uri, line });
  };

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      {results.map((result, i) => (
        <CommandItem
          key={`${result.uri}-${result.lineStart}-${i}`}
          className="flex flex-col text-left gap-1 p-3 rounded-md bg-secondary/20 hover:bg-secondary/40 border border-transparent hover:border-border transition-all cursor-pointer group data-[selected=true]:bg-secondary/50 data-[selected=true]:border-border outline-hidden"
          value={`${result.filePath ?? 'Unknown File'}-${result.lineStart}`}
          onSelect={() => openFile(result.uri, result.lineStart)}
        >
          <div className="flex items-center gap-2 w-full overflow-hidden">
            <FileCode className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground truncate opacity-80 group-hover:opacity-100">
              {result.filePath ?? 'Unknown File'}
            </span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
              <CornerDownRight className="w-3 h-3" />
              {result.lineStart}
            </span>
          </div>

          <pre className="mt-1 text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto w-full font-mono text-muted-foreground group-hover:text-foreground transition-colors max-h-[200px] overflow-y-auto">
            <code>{result.snippet ?? ''}</code>
          </pre>
        </CommandItem>
      ))}
    </div>
  );
}