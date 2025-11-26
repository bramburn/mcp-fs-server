/// <reference types="react" />
/// <reference types="react-dom" />
/// <reference types="vite/client" />

interface VsCodeApi<T = unknown> {
  postMessage(message: unknown): void;
  getState<S = T>(): S | undefined;
  setState(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => VsCodeApi<T>;
  }

  // Some code (e.g. src/webviews/app/lib/vscode.ts) uses a global acquireVsCodeApi
  // function rather than window.acquireVsCodeApi, so we declare it here.
  // It will be provided by the VS Code webview environment at runtime.
  // eslint-disable-next-line no-var
  var acquireVsCodeApi: <T = unknown>() => VsCodeApi<T>;
}

export {};
