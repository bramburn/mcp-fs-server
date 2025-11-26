import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Ensure we cleanup React Testing Library between tests
afterEach(() => {
  cleanup();
});

// Minimal VS Code API mock for webview tests
declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage: (message: unknown) => void;
      getState: <S = T>() => S | undefined;
      setState: (state: T) => void;
    };
  }
}

// Provide a default implementation if not already defined
if (typeof window !== 'undefined' && !window.acquireVsCodeApi) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultApi = <T = unknown>(): any => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  });

  window.acquireVsCodeApi = defaultApi;
}