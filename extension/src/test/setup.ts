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

// jsdom polyfills for webview React components

// 1) ResizeObserver used internally by cmdk
if (typeof window !== 'undefined' && typeof (window as any).ResizeObserver === 'undefined') {
  class ResizeObserver {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    observe(_target: any) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unobserve(_target: any) {}
    disconnect() {}
  }
  (window as any).ResizeObserver = ResizeObserver;
}

// 2) scrollIntoView used by cmdk to keep active item visible
if (typeof window !== 'undefined') {
  const protoTargets = [
    (Element.prototype as any),
    (window as any).HTMLElement?.prototype,
  ].filter(Boolean);

  for (const proto of protoTargets) {
    if (typeof proto.scrollIntoView !== 'function') {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      proto.scrollIntoView = () => {};
    }
  }
}