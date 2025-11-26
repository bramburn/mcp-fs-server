import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { useIpc } from '../contexts/ipc';
import {
  LOAD_CONFIG_METHOD,
  START_INDEX_METHOD,
  CONFIG_DATA_METHOD,
  DID_CHANGE_CONFIG_NOTIFICATION,
  EXECUTE_COMMAND_METHOD,
  type QdrantOllamaConfig,
} from '../../protocol';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Settings as SettingsIcon, ChevronLeft } from 'lucide-react';

export default function Settings() {
  const ipc = useIpc();

  const config = useAppStore((state) => state.config);
  const setConfig = useAppStore((state) => state.setConfig);
  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  const [loading, setLoading] = useState(false);
  const [showStale, setShowStale] = useState(false);

  const refreshConfig = useCallback(() => {
    setLoading(true);
    ipc
      .sendRequest<{}, QdrantOllamaConfig | null>(LOAD_CONFIG_METHOD, 'qdrantIndex', {})
      .then((cfg) => {
        setConfig(cfg ?? undefined);
      })
      .catch((error) => {
        console.error('Failed to load config:', error);
        setConfig(undefined);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [ipc, setConfig]);

  const handleReindex = useCallback(() => {
    ipc.sendCommand(START_INDEX_METHOD, 'qdrantIndex', {});
  }, [ipc]);

  const handleOpenSettings = useCallback(() => {
    ipc.sendCommand(
      EXECUTE_COMMAND_METHOD,
      'webview-mgmt',
      {
        command: 'qdrant.openSettings',
      }
    );
  }, [ipc]);

  const goBack = useCallback(() => {
    setView('search');
  }, [setView]);

  // Initial load + notifications
  useEffect(() => {
    if (!config) {
      refreshConfig();
    }

    ipc.onNotification<QdrantOllamaConfig | null>(CONFIG_DATA_METHOD, (cfg) => {
      setConfig(cfg ?? undefined);
    });

    ipc.onNotification<{ configKey: string; value: unknown }>(
      DID_CHANGE_CONFIG_NOTIFICATION,
      (params) => {
        if (params.configKey === 'overview.stale.show') {
          setShowStale(Boolean(params.value));
        }
      }
    );
  }, [ipc, config, refreshConfig, setConfig]);

  // Mirror the Svelte effect that pushes stale preference changes to host
  useEffect(() => {
    ipc.sendCommand('update/preferences', 'webview-mgmt', {
      'overview.stale.show': showStale,
    });
  }, [ipc, showStale]);

  const effectiveConfig = config;

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={goBack} className="p-1" title="Back to search">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <div className="flex flex-col gap-6">
          {/* Configuration Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/90">Configuration</h3>
              <Button
                variant="link"
                size="sm"
                onClick={refreshConfig}
                className="text-xs p-0 h-auto"
              >
                Refresh
              </Button>
            </div>

            {loading && !effectiveConfig && (
              <div className="text-xs text-muted-foreground">Loading configuration...</div>
            )}

            {!loading && effectiveConfig && (
              <div className="flex flex-col gap-2 text-xs text-muted-foreground bg-secondary/20 p-3 rounded border border-border/50">
                <div>
                  <strong>Index Name:</strong>{' '}
                  {effectiveConfig.index_info?.name ?? 'Not configured'}
                </div>
                <div>
                  <strong>Qdrant URL:</strong>{' '}
                  {effectiveConfig.qdrant_config?.url ?? 'Not configured'}
                </div>
                <div>
                  <strong>Ollama Model:</strong>{' '}
                  {effectiveConfig.ollama_config?.model ?? 'Not configured'}
                </div>
              </div>
            )}

            {!loading && !effectiveConfig && (
              <div className="text-xs text-muted-foreground bg-yellow-500/10 p-3 rounded border border-yellow-500/20">
                No configuration loaded. Ensure{' '}
                <code>.qdrant/configuration.json</code> exists in your workspace.
              </div>
            )}
          </div>

          {/* Actions Section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground/90">Actions</h3>

            <Button
              variant="outline"
              onClick={handleOpenSettings}
              className="w-full justify-start"
            >
              Open Workspace Settings
            </Button>

            <Button
              onClick={handleReindex}
              disabled={indexStatus === 'indexing'}
              className="w-full"
            >
              {indexStatus === 'indexing' ? 'Indexing...' : 'Force Re-index'}
            </Button>
          </div>

          {/* Filters / Stale Switch */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground/90">Filters</h3>
            <div className="flex items-center justify-between p-2 border rounded">
              <label htmlFor="stale-filter" className="text-sm">
                Show Stale Results
              </label>
              <Switch
                id="stale-filter"
                checked={showStale}
                onCheckedChange={(value) => setShowStale(Boolean(value))}
              />
            </div>
          </div>

          {/* Status Section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground/90">Status</h3>

            <div className="flex items-center gap-2 text-xs">
              <span
                className={
                  'w-2 h-2 rounded-full ' +
                  (indexStatus === 'ready'
                    ? 'bg-green-500'
                    : indexStatus === 'indexing'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500')
                }
              />
              <span className="text-muted-foreground">
                {indexStatus === 'ready'
                  ? 'Index Ready'
                  : indexStatus === 'indexing'
                  ? 'Indexing in progress...'
                  : 'Index Error'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}