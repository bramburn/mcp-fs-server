import { useEffect } from 'react';
import { IpcProvider } from './contexts/ipc';
import { hostIpc } from './lib/vscode';
import { useAppStore } from './store';
import {
  SEARCH_METHOD,
  INDEX_STATUS_METHOD,
  LOAD_CONFIG_METHOD,
  CONFIG_DATA_METHOD,
} from '../protocol';
import type {
  IpcMessage,
  IpcNotification,
  SearchResponseParams,
  IndexStatusParams,
  QdrantOllamaConfig,
} from '../protocol';
import Search from './views/Search';
import Settings from './views/Settings';
import CommandPaletteTest from './components/CommandPaletteTest';

export default function App() {
  const view = useAppStore((state) => state.view);
  const setSearchResults = useAppStore((state) => state.setSearchResults);
  const setIndexStatus = useAppStore((state) => state.setIndexStatus);
  const setIndexProgress = useAppStore((state) => state.setIndexProgress);
  const setConfig = useAppStore((state) => state.setConfig);

  useEffect(() => {
    // Initial config load
    hostIpc.sendRequest(LOAD_CONFIG_METHOD, 'webview-mgmt', {}).catch((error) => {
      console.error('Failed to load initial config:', error);
    });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as IpcMessage;

      if (message.scope !== 'webview-mgmt') return;

      if (message.kind === 'notification') {
        const notification = message as IpcNotification<unknown>;

        switch (message.method) {
          case SEARCH_METHOD: {
            const params = notification.params as SearchResponseParams | undefined;
            if (params) {
              setSearchResults(params.results ?? []);
            }
            break;
          }

          case INDEX_STATUS_METHOD: {
            const params = notification.params as IndexStatusParams | undefined;
            if (params) {
              setIndexStatus(params.status);
              if (typeof params.progress === 'number') {
                setIndexProgress(params.progress);
              }
            }
            break;
          }

          case CONFIG_DATA_METHOD: {
            const cfg = (notification.params as QdrantOllamaConfig | null) ?? undefined;
            setConfig(cfg);
            break;
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setSearchResults, setIndexStatus, setIndexProgress, setConfig]);

  return (
    <IpcProvider value={hostIpc}>
      <main className="h-screen w-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-primary/30">
        {view === 'search' && <Search />}
        {view === 'settings' && <Settings />}
        {view === 'test' && <CommandPaletteTest />}
        {view !== 'search' && view !== 'settings' && view !== 'test' && (
          <div className="p-4">Unknown view</div>
        )}
      </main>
    </IpcProvider>
  );
}