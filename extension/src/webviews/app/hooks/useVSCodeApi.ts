import { useRef, useCallback } from 'react';
import type { IpcMessage } from '../../protocol';

// VS Code API type definitions
declare const acquireVsCodeApi: <T = unknown>() => VsCodeApi<T>;
interface VsCodeApi<T = unknown> {
  postMessage(message: IpcMessage): void;
  getState(): T | undefined;
  setState(state: T): void;
}

/**
 * React hook that safely acquires and caches the VS Code API instance.
 * Prevents "An instance of the VS Code API has already been acquired" errors during hot reload.
 */
export function useVSCodeApi(): VsCodeApi | null {
  const apiRef = useRef<VsCodeApi | null>(null);

  // Only acquire the API once per component lifecycle
  if (!apiRef.current && typeof window !== 'undefined' && 'acquireVsCodeApi' in window) {
    try {
      apiRef.current = (window as any).acquireVsCodeApi();
    } catch (error) {
      console.error('Failed to acquire VS Code API:', error);
    }
  }

  return apiRef.current;
}

/**
 * Hook that provides a safe wrapper for posting messages to VS Code.
 * Returns a function that safely posts messages if the API is available.
 */
export function useVSCodePostMessage() {
  const vscodeApi = useVSCodeApi();

  return useCallback((message: IpcMessage) => {
    if (vscodeApi) {
      try {
        vscodeApi.postMessage(message);
      } catch (error) {
        console.error('Failed to post message to VS Code:', error);
      }
    }
  }, [vscodeApi]);
}