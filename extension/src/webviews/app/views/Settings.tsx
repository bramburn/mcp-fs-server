import React, { useEffect, useState } from 'react';
import { useVSCodeApi } from '../hooks/useVSCodeApi.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import { Label } from '../components/ui/label.js';

// Ensure the type definition matches protocol.ts
type IndexingStatus = 'initial' | 'indexing' | 'synced' | 'out-of-sync' | 'error' | 'not-indexed';

export const Settings: React.FC = () => {
  const vscode = useVSCodeApi();
  const [status, setStatus] = useState<IndexingStatus>('initial');

  useEffect(() => {
    // Listen for status updates from the extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.method === 'index/status' && message.params) {
        setStatus(message.params.status);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial status
    if (vscode) {
      vscode.postMessage({
        id: crypto.randomUUID(),
        scope: 'qdrantIndex',
        timestamp: Date.now(),
        kind: 'command',
        method: 'index/status',
        params: {}
      });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  const handleIndexWorkspace = () => {
    if (vscode) {
      vscode.postMessage({
        id: crypto.randomUUID(),
        scope: 'qdrantIndex',
        timestamp: Date.now(),
        kind: 'command',
        method: 'index/start',
        params: {}
      });
    }
  };

  const handleClearIndex = () => {
    if (vscode) {
      vscode.postMessage({
        id: crypto.randomUUID(),
        scope: 'qdrantIndex',
        timestamp: Date.now(),
        kind: 'command',
        method: 'index/clear',
        params: {}
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure extension settings and manage indexing.</p>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Indexing Status</h2>

        {/* Not Indexed State - Prominent Call to Action */}
        {status === 'not-indexed' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-medium">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              Repository Not Indexed
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              This repository hasn't been indexed yet. Indexing is required to enable semantic search and context-aware features.
            </p>
            <Button onClick={handleIndexWorkspace} appearance="primary" className="w-full sm:w-auto self-start">
              Index Repository
            </Button>
          </div>
        )}

        {/* Synced State */}
        {status === 'synced' && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            <span>Index is up to date</span>
          </div>
        )}

        {/* Indexing State */}
        {status === 'indexing' && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
             <span className="animate-pulse h-2 w-2 rounded-full bg-yellow-500"></span>
             <span>Indexing in progress...</span>
          </div>
        )}

        {/* Out of Sync State */}
        {status === 'out-of-sync' && (
           <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                <span>Index is out of sync</span>
              </div>
              <Button onClick={handleIndexWorkspace} appearance="outline" size="small">
                Update Index
              </Button>
           </div>
        )}

        <div className="pt-4">
           <Label className="mb-2 block">Maintenance</Label>
           <Button onClick={handleClearIndex} appearance="outline" size="small">
             Clear Index & Reset
           </Button>
        </div>
      </div>
    </div>
  );
};